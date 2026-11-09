# 讯飞星辰 MaaS × Magpie 插件 — 设计文档

日期:2026-11-09
状态:待用户批准

## 意图与背景

让 magpie 用户把科大讯飞**星辰 MaaS 平台**当作供应商使用:登录后,星火及开源模型
(GLM/DeepSeek/Kimi/Qwen/MiniMax 等)出现在所有接入 magpie 的 Agent(Claude Code、Codex、
OpenCode…)的模型选择器里,享受 magpie 的多账号、故障切换和协议转换。

用户明确要求覆盖**三条产品线**:

1. **按量付费 API** — `maas-api.cn-huabei-1.xf-yun.com`,API Key `ak-…`,全部星火+开源模型,按 token 计费
2. **Codingplan(Astron Coding Plan)** — `maas-coding-api.cn-huabei-1.xf-yun.com`,套餐专属 Key,
   `xspark*` + 套餐内开源模型,按请求次数 5h/周/月窗口流控,模型有 1–5 倍抵扣系数
3. **Tokenplan(Astron Token Plan)** — `maas-token-api.cn-huabei-1.xf-yun.com`,套餐专属 Key,
   按 token 折算积分(成员档月度积分额度)

最终交付:**发布到 npm + GitHub 仓库(打 `magpie-plugin` topic)+ 向
`magpie-community/plugins` 的 `registry.json` 提 PR 收录进 magpie 推荐列表**。

## 事实依据(来自讯飞官方文档,已核对)

- 三条产品线均为三种协议:OpenAI Chat(`/v2/chat/completions`)、OpenAI Responses(`/v1/responses`)、
  Anthropic(`/anthropic/v1/messages`);认证统一 `Authorization: Bearer <key>`(Anthropic 端点也接受)。
- **无公开的「模型列表」「用量/余额」API**——模型来自控制台;用量在控制台/套餐页查看。
  ⇒ 模型表只能静态维护;`auth.usage`/`refresh`/`checkin` 钩子 v1 不实现(README 说明用量在控制台看)。
- Chat 请求要点:
  - 星火模型:深度思考用 `thinking: {type: "enabled"|"disabled"|"auto"}`;`tools` 支持
    `function` 与 `web_search`;`temperature` 默认 1、`top_p` 默认 0.95;`max_tokens` 已废弃 →
    `max_completion_tokens`。Spark-X2.6-4B 支持 high/low/none 三档推理。
  - 开源模型:思考用 `enable_thinking`(bool)+ `reasoning_effort`(`high`/`max`,兼容映射
    low/medium→high、xhigh→max;支持 GLM-5.3/5.2、DeepSeek-V4-Flash/Pro);`presence_penalty`/
    `frequency_penalty` 可用;响应含 `reasoning_content`、`usage.prompt_tokens_details.cached_tokens`。
  - 错误语义:401=APIKEY 错误;403/11221=套餐不含该模型;429=日限额/QPS/TPM;503=排队/并发不足。
- 无 models.dev 条目,供应商需在 `config` 钩子声明。

## 目标

- 一个 npm 包 `opencode-xfyun-maas-auth`,导出**三个插件函数**(magpie/OpenCode 明确支持
  「导出多个函数=多个供应商」),对应三个供应商 id:
  - `xfyun-maas` — 讯飞星辰 MaaS(按量付费)
  - `xfyun-coding` — 讯飞 Coding Plan
  - `xfyun-token` — 讯飞 Token Plan
  (id `xfyun` 已被 npm 包 `opencode-xfyun-auth`(itgo067, 2026-10)占用——它只做按量付费线、
  未进官方推荐列表;我们用 `-maas` 后缀避免两个插件抢同一个供应商 id。)
- 每个供应商:API Key 登录方式(`type: "api"`),loader 注入 Bearer 头;模型用
  `@ai-sdk/openai-compatible`(Chat Completions,magpie 网关会做协议转换);`provider.models`
  静态返回按文档整理的模型表。
- Codingplan 模型带 `rate`(抵扣系数),如 GLM-5.2 `rate: 5`、Qwen3.6-35B `rate: 1`。
- 在 magpie 沙箱(独立 HOME)里完成加载/登录/请求的端到端测试:先 mock 服务器,再真机 key。
- 发布:用户 npm 账号 `npm publish`;GitHub 公开仓库(README、LICENSE、topic `magpie-plugin`);
  registry.json PR 条目(package/name/icon/providers/summary)。

## 非目标(v1 不做)

- `auth.usage` / `auth.refresh` / `auth.checkin` — 官方无公开 API(控制台登录态接口不属于稳定契约)。
  若后续讯飞开放接口,补一个 minor 版本。
- 图像输入 — Chat Completions 的 content parts 当前仅 `type=text`(图像理解是独立 API),模型统一
  标 `input: ["text"]`。
- `cost`(美元价格)— 按量付费价格页为 CNY 且动态,套餐本身非按 token 计费,均不填(文档说套餐可不填)。
- 精调/批量推理/向量/重排/OCR 专用模型 — 不纳入模型表。
- 已下线模型(`【260930下线】`/`【261009下线】`/`已下线`)一律排除。

## 反目标

- 不调用控制台私有接口(易碎、可能违反条款)。
- 不在插件里缓存/记录对话或密钥;不打印请求体到日志。
- 不做「一个供应商三种登录方式」的合并——三条产品线域名、模型、计费语义都不同,混在一个 id 下
  会让账号配额和故障切换语义错乱。

## 方案取舍(Approaches)

**A. 一个包、三个插件函数(选定)**
`index.mjs` 导出 `XfyunMaaSPlugin` / `XfyunCodingPlugin` / `XfyunTokenPlugin`,共用 `lib/` 里的
模型表与 fetch 封装。一次安装三个供应商都可用;维护一份代码。
代价:包体稍大(三张模型表);用户只想要其中一条线时也装了全部(无运行时开销,只是列表多两项)。

**B. 三个独立 npm 包** — 粒度干净,但三份重复配置、三次发布、registry 三条目,v1 维护成本高。
**C. 一个供应商 + 三种登录方式,loader 按 auth 换 baseURL** — 最省事,但三线模型集不同、
按量付费与套餐的额度语义完全不同,混在一个供应商 id 下会误导 magpie 的用量/故障切换;否决。

**协议选择**:所有模型统一走 Chat Completions(`@ai-sdk/openai-compatible`,baseURL `<host>/v2`)。
理由:三条线该协议最完整(工具调用、流式、usage、缓存统计都有);magpie 网关负责把 Agent 的
Anthropic/Responses 请求转成 Chat Completions,讯飞自己的 Anthropic 端点也是转换层,再套一层没有收益。
Anthropic/Responses 端点在 README 里注明,供用户在 magpie 之外直连时参考。

## 设计

### 目录

```
opencode-xfyun-maas-auth/
├── package.json          # main: ./opencode.mjs(1.x/magpie 入口); exports["."]: ./opencode2.mjs(OpenCode 2.x 适配)
│                         # keywords: opencode, opencode-plugin, magpie, xfyun, iflytek, spark; magpie.icon/name/summary/maxConcurrency
├── index.mjs             # 实现:三个插件函数 + export const _internal(测试用)
├── opencode.mjs          # 1.x 入口:从 index.mjs 具名导出三个插件函数(magpie/OpenCode 1.x 加载)
├── opencode2.mjs         # 社区标准 OpenCode 2.x 适配器,从 magpie-community/plugins scripts/opencode2.mjs 逐字节复制
├── lib/
│   ├── models.mjs        # 三张模型表(数据与文档表格一一对应,附来源注释)
│   └── api.mjs           # loader/fetch 构造、请求体微调、错误包装
├── test/
│   ├── api.test.mjs      # bun test 单元测试(_internal)
│   ├── models.test.mjs   # 模型表完整性(无重复 id、必填字段、下线模型不在)
│   └── mock/server.mjs   # 本地 mock:三协议端点 + SSE + 错误码
├── scripts/check.mjs     # 仿 magpie 宿主加载插件、跑钩子(对齐社区 check.mjs 的断言)
├── README.md / README.zh-CN.md
├── LICENSE (MIT)
└── icon.svg              # 供应商图标(registry 与 package.json 引用)
```

打包结构对齐 magpie-community/plugins 的社区规范(river 等包已核对):
`main` 给 magpie/OpenCode 1.x(具名函数导出),`exports["."]` 给 OpenCode 2.x
(default `{id, setup}`);两份入口都进 `files`。

### 插件行为

- `config` 钩子:`cfg.provider ??= {}` + 每供应商一条(`name`、`npm: "@ai-sdk/openai-compatible"`、
  `api: <host>/v2`、`models` 静态表)。每模型:`name`、`limit: {context, output}`(output 上限文档未给,
  按保守值 32K/64K 填,真机验证后修正)、`reasoning`(思考模型)、`tool_call: true`、
  Codingplan 模型加 `rate`。
- `auth`:`provider` 对应 id;`methods: [{type: "api", label, placeholder: "ak-…"}]`;
  `loader(getAuth)` 返回 `{ baseURL, apiKey }` + `fetch`,fetch 里:
  1. `Authorization: Bearer <key>`(host 头安全起见显式设置);
  2. **请求体微调**(仅 POST JSON 时):删除上游标注「已废弃/不支持」的字段
     (`max_tokens`→`max_completion_tokens` 改名;星火模型剥 `reasoning_effort`/`enable_thinking` 并映射
     到 `thinking.type`;开源模型剥 `thinking`),确保 `stream` 透传;
  3. 401 响应加 `X-Magpie-Sign-In: expired`;429/503 原样透传(magpie 自会退避/切换);
  4. 改写流式正文时不动(我们不改 body,只改请求),响应原样返回。
- `provider.models`:直接返回静态表(不触网,永不失败)。
- 不导出其它函数(避免被当插件执行);测试辅助全部放 `_internal`。

### 模型表(v1,来源:2.1/2.1.1/2.2/5.1/5.2 文档页)

- **xfyun-maas(按量)**:`spark-x2.6`(1M)、`spark-x2.6-4b`(1M)、`spark-x2.6-preview`(256K)、
  `spark-x2.5`(256K)、`spark-x2.5-4b`/`-1.7b`(1M);开源:`xopglm53`(1M)、`xopdeepseekv4pro0813`(1M)、
  `xopdeepseekv4flash0731`(1M)、`xopkimik27code`(256K)、`xopglm52`(1M)、`xopkimik26`(256K)、
  `xopdeepseekv4pro`(1M)、`xopqwen36v35b`(128K)、`xopglm51`(200K)、`xop35qwen2b`(32K)、
  `xop3qwencodernext`(256K)、`xopqwen35397b`(256K)、`xminimaxm25`(128K)、`xopglm5`(200K)、
  `xopkimik25`(128K)、`xopglmv47flash`(128K)、`xop3qwen80bnext`(256K)、`xop3qwen235b2507`(64K)、
  `xop3qwen32b`(32K)、`xop3qwen14b`/`8b`/`4b`(16K)、`xop3qwen0b6`(32K)、`xdeepseekr1qwen32b`(8K)、
  `xqwen257bchat`、`xqwen14bchat`(8K)。
  思考:`spark*`、`xopglm5*`、`xopdeepseekv4*`、`xdeepseekr1qwen32b`。
- **xfyun-coding**:`xsparkx2agent`(rate 2)、`xsparkx2`(2)、`xsparkx2flash`(1)、`auto`(2)、
  `xopglm52`(5)、`xopglm51`(4)、`xopglm5`(3)、`xopdeepseekv4pro`(5)、`xopdeepseekv4flash`(2)、
  `xopdeepseekv32`(2)、`xopkimi27code`(5)、`xopkimik26`(4)、`xopkimik25`(3)、`xminimaxm25`(2)、
  `xopqwen35397b`(2)、`xopqwen36v35b`(1)、`xopqwen35v35b`(1)、`xop3qwencodernext`(1)、`xopglmv47flash`(1)。
  (注意 Codingplan 的 Kimi-K2.7-Code id 是 `xopkimi27code`,与按量的 `xopkimik27code` 不同,按 5.1 文档照抄;
  抵扣系数适用于 2026-07-23 后新购的高效/速通版,README 注明。)
- **xfyun-token**:`spark-x2.5`、`xsparkx2flash`、`xopglm52`、`xopglm51`、`xopglm5`、`xopdeepseekv4pro`、
  `xopkimik26`、`xopkimik25`、`xminimaxm25`、`xopqwen35397b`、`xopqwen36v35b`、`xopqwen35v35b`、
  `xop3qwencodernext`、`xopglmv47flash`(上下文按 5.2 表;排除全部已下线项——
  `xopdeepseekv4flash`/`xopdeepseekv32`/`xsparkx2agent`/`xsparkx2`。若真机探测发现仍可用,再加回)。
  Tokenplan 文档页的三个端点标签存在错位,Responses 端点是否可用不确定:README 只承诺 Chat 与
  Anthropic 两种协议,不替讯飞背书 Responses。
- 同一模型跨线 context 不一致时(如 Kimi-K2.5 128K 一致、Qwen3.5-397B 256K 一致),以各自产品线文档为准。

### 测试计划

1. **单元(bun test)**:请求体微调的映射规则;模型表完整性;错误包装;`_internal` 全覆盖。
2. **加载冒烟(scripts/check.mjs)**:仿宿主调用插件函数,断言 config/auth/provider 钩子形状
   (参考 magpie-community/plugins 的 check.mjs)。
3. **magpie 沙箱 E2E(Windows)**:下载 `magpie-cli-windows-amd64.exe`,独立 `HOME` 跑
   `magpie plugin add ./…` / `plugin login` / `provider test`:
   - 先用 mock 服务器(插件 baseURL 支持测试注入);
   - 用户拿到真机 key 后对三个供应商各跑一次 `provider test` + 一次流式对话,并验证
     thinking/工具调用/图像提示词被正确处理(图像按文档仅文本,预期不会出错但确认不崩)。
4. 发布前 `npm publish --dry-run --provenance` 校验 files/keywords。

### 发布与上架

1. GitHub 公开仓库(用户提供账号;我准备好全部内容与 PR 文案),topic `magpie-plugin`、
   repository 字段指向仓库;LICENSE MIT。
2. npm:`npm login`(用户操作或给 token)`npm publish`。包名 `opencode-xfyun-maas-auth`
   (被占用则 `opencode-xfyun-auth` → `magpie-xfyun-maas`)。
3. registry.json PR(fork `magpie-community/plugins`,加一条;**条目以 `docs/registry-pr.md` 为准**——
   下面这段早期草稿的 providers id 有误,已被修正取代):
   `{ "package": "opencode-xfyun-maas-auth", "name": "讯飞星辰 MaaS", "icon": "<raw svg url>",
      "providers": ["xfyun", "xfyun-coding", "xfyun-token"],
      "summary": { "en": "iFlytek Xfyun MaaS: Spark, GLM, DeepSeek, Kimi, Qwen and more.",
                   "zh": "讯飞星辰 MaaS:星火、GLM、DeepSeek、Kimi、Qwen 等模型,按量付费与 Coding/Token 套餐。" } }`
4. README(npm 详情页即 magpie 详情页):写清三个供应商登录什么、key 在哪拿、模型列表、
   计费/流控差异、magpie 与 OpenCode 双兼容说明。

## 支持面(设计决策)

- **magpie 是 v1 唯一测试的宿主**。包结构同时满足 OpenCode 1.x(具名函数导出)与 2.x
  (opencode2.mjs 适配器)的加载约定,但直接装进 OpenCode 属于**尽力兼容、未列入测试矩阵**;
  README 明确这一边界,不替未测路径背书。

## 留给实现者的判断

- output limit 具体数值(文档只给 context):统一先填 32K(small 模型 8–16K),真机验证后修。
- `variants`(推理档位)是否暴露:待真机确认 `reasoning_effort` 在星火模型的接受度后再加,v1 只标 `reasoning: true`。
- `magpie.maxConcurrency`:按量默认;Codingplan 高峰动态限流,给 4。

## 竞品与生态(2026-11-09 核对)

- npm 已有 `opencode-xfyun-auth`(itgo067):仅按量付费线、10 个模型、provider id `xfyun`,
  含 CNY→USD 价格换算与 protocol 选项(chat/anthropic/responses);未收录进官方 registry.json。
  其代码引用了**未见于文档的 `GET /v2/models` 模型列表端点**——拿到真机 key 后先验证
  (三条线各测一次 `/v2/models`);若可用,`provider.models` 升级为「动态发现 + 静态元数据兜底」,
  静态表仅存 context/output/reasoning/rate 等文档信息。
- registry.json 中讯飞系已有 AStudio、Loomy 两个产品(不同产品线,不冲突);星辰 MaaS 三条线均无收录。
- registry 条目格式已核对:`{package, name, icon?, providers[], community?, summary{en,zh}}`;
  icon 支持 https URL / data: URI / magpie 内置图标名。
