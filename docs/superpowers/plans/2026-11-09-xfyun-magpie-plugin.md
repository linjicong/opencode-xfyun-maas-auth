# 讯飞星辰 MaaS × Magpie 插件 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现并发布 `opencode-xfyun-maas-auth`:一个 magpie/OpenCode 插件包,三个供应商(`xfyun-maas`/`xfyun-coding`/`xfyun-token`)接入讯飞星辰 MaaS 三条产品线。

**Architecture:** 单包多插件函数(OpenCode 1.x 具名导出 + 2.x 适配器);每个供应商 = `config`(静态模型表)+ `auth`(API key loader)+ `provider.models`(静态返回);loader 的 fetch 做 Bearer 注入、请求体微调(max_tokens 改名、thinking 参数族按模型族映射)、401 加 `X-Magpie-Sign-In: expired`。零运行时依赖。

**Tech Stack:** 纯 ESM JavaScript(Bun 运行时兼容 Node 语法);`bun test` 单元测试;Node http mock 服务器;magpie Windows CLI 沙箱 E2E;GitHub Actions(npm publish + provenance)。

**Spec:** `docs/superpowers/specs/2026-11-09-xfyun-magpie-plugin-design.md`(模型表数值、抵扣系数、排除清单、供应商 id 与 origin 均以 spec 为准,本计划不重复转抄,只引用)。

## Global Constraints

- 仓库根 = 包根(package.json 在仓库根目录,GitHub topic `magpie-plugin` 的要求)。仓库路径 `D:\ai-workspace\xfun\opencode-xfyun-maas-auth`。
- `"type": "module"`,**零运行时依赖**(devDependencies 仅 `@types/bun`,可选)。
- 入口契约:`"main": "./opencode.mjs"`,该文件**只**导出三个 async 函数 `XfyunMaaSPlugin`/`XfyunCodingPlugin`/`XfyunTokenPlugin`(OpenCode 1.x 会把每个导出函数当插件执行);`"exports": { ".": "./opencode2.mjs" }`,opencode2.mjs 从 `magpie-community/plugins` 的 `scripts/opencode2.mjs` **逐字节复制**。`_internal` 只放 `index.mjs`。
- 供应商常量(取自 spec):id `xfyun-maas`/`xfyun-coding`/`xfyun-token`;origin 分别为 `https://maas-api.cn-huabei-1.xf-yun.com`、`https://maas-coding-api.cn-huabei-1.xf-yun.com`、`https://maas-token-api.cn-huabei-1.xf-yun.com`;baseURL 一律 `${origin}/v2`,npm 一律 `@ai-sdk/openai-compatible`。
- 显示名:`讯飞星辰 MaaS` / `讯飞 Coding Plan` / `讯飞 Token Plan`;登录 label:`MaaS API Key` / `Coding Plan API Key` / `Token Plan API Key`;placeholder 统一 `ak-…`。
- 模型表数值逐条取自 spec「模型表」节(其来源为讯飞文档);排除清单、coding 的 `rate` 值、token 的 reasoning 规则同样以 spec 为准,不得自行增删模型。
- 推理标记规则(spec 已定):maas 线 = spark*、xopglm5/51/52/53、xopdeepseekv4*、xdeepseekr1qwen32b;coding 线 = xspark*、auto、xopglm52/51/5、xopdeepseekv4pro/flash;token 线 = 全部(5.2 表每款都有思考积分)。
- output 上限规则:context ≥ 1M → 65536;33K–256K → 32768;≤ 32K → 16384。
- `maxConcurrency`:仅 coding 插件的 auth 上设 4;其余不设。
- 代码中不得 `console.log` 请求体、密钥或对话内容。
- LICENSE MIT;package.json `files` 至少含 `index.mjs`、`opencode.mjs`、`opencode2.mjs`、`lib/`、`README.md`、`LICENSE`。
- 每个任务收尾 `git commit`(main 分支,首次提交前 `git init`)。

## Review Focus

1. **SSE 流式透传**:fetch 包装不得缓冲/拼接响应体,分块必须按序原样传给 magpie(改了流就废了流式)。→ Task 3 集成测试:两个 chunk 分两次 flush,断言逐块到达。
2. **401 改写响应头不破坏正文**:加 `X-Magpie-Sign-In: expired` 时 status/headers/body 必须完整保留。→ Task 3:401 用例断言状态码、原响应头、正文逐字节一致。
3. **请求体微调零副作用**:未涉及改名的字段(含 `tools` 数组、`web_search`、`messages`)必须逐字节不变;非 JSON body 原样返回。→ Task 2:深度相等 + JSON.stringify 对比。
4. **config 不覆盖用户配置**:`cfg.provider` 预填同 id 时 `??=` 语义生效。→ Task 2:预填 cfg 断言原值保留。
5. **脏 key 与未登录**:`getAuth()` 返回 undefined/空串/全空白 key 时 loader 返回 `{}`,绝不发 `Bearer ` 空头。→ Task 2:三个用例。

---

### Task 1: 仓库脚手架 + 模型表

**Files:**
- Create: `package.json`, `LICENSE`, `.gitignore`, `lib/models.mjs`, `test/models.test.mjs`
- Create: `icon.svg`(占位简单 SVG,Task 6 再打磨)

**Interfaces:**
- Produces(Task 2/4 依赖,签名固定):
  - `ORIGINS = { maas, coding, token }`(三条产品线 origin 字符串)
  - `MODELS = { maas: [...], coding: [...], token: [...] }`,每项 `{ id, name, ctx, out, reasoning?: true, rate?: number }`
  - `toProviderModels(list) -> { [id]: { name, limit: { context, output }, reasoning?: true, tool_call: true, rate?: number } }`
  - `PROVIDER_META = { maas: { id: "xfyun-maas", name: "讯飞星辰 MaaS", label: "MaaS API Key" }, coding: {...含 maxConcurrency: 4}, token: {...} }`

- [ ] **Step 1: 安装 bun 并初始化仓库**

Run(bash): `npm install -g bun && bun --version`(`bun` 用于跑测试;若失败改用 `npx bun` 或下载安装器,记录所选方式)。`git init`(在 `D:\ai-workspace\xfun\opencode-xfyun-maas-auth`)。

- [ ] **Step 2: 写失败的模型表测试 `test/models.test.mjs`**

断言(数值以 spec 模型表为准):
- 三张表无重复 id;每项都有非空 `id`/`name`、`ctx`/`out` 为正整数;
- `coding` 表每一项都有 `rate`(1–5 整数),且 `xopkimi27code` 的 rate 为 5;
- `token` 表不含 `xopdeepseekv4flash`/`xopdeepseekv32`/`xsparkx2agent`/`xsparkx2`;`maas` 表含 `spark-x2.6-preview` 且不含任何带【下线】标记的 id;
- `toProviderModels(coding)` 产出的 `xsparkx2agent` 含 `rate: 2`、`limit: {context: 262144, output: 32768}`(coding 线 spec 未给 context 的模型用 256K;有 5.2 表数据的按 5.2);
- `PROVIDER_META` 三项 id/name/label 与 Global Constraints 一致,coding 项含 `maxConcurrency: 4`。

- [ ] **Step 3: 运行确认失败**

Run: `bun test test/models.test.mjs`
Expected: FAIL(模块不存在)。

- [ ] **Step 4: 实现 `lib/models.mjs`**

三个常量 + `toProviderModels` 纯映射。模型数据逐条转抄 spec 模型表(带来源注释);`out` 按 Global Constraints 的三档规则。`package.json` 按入口契约写好(main/exports/files/keywords/magpie 字段;`magpie.icon` 留到 Task 6 填 data URI)。LICENSE = MIT(版权人 `opencode-xfyun-maas-auth contributors`,发布前可改)。

- [ ] **Step 5: 测试通过后提交**

Run: `bun test test/models.test.mjs` → PASS;`git add -A && git commit -m "feat: model tables for the three xfyun product lines"`。

### Task 2: API 层 — 请求体微调 + 插件工厂

**Files:**
- Create: `lib/api.mjs`, `test/api.test.mjs`
- Test: Task 1 的 `lib/models.mjs`(只读消费)

**Interfaces:**
- Consumes: `MODELS`、`PROVIDER_META`、`toProviderModels`、`ORIGINS`(Task 1)。
- Produces:
  - `transformBody(modelId: string, body: string|undefined) -> string|undefined`(纯函数)
  - `makePlugin(line: "maas"|"coding"|"token") -> async (input) => { config, auth, provider }`(完整钩子三件套工厂)
  - `_internal`(由 index.mjs 在 Task 4 组装):`{ transformBody, makePlugin, makeFetch }`

- [ ] **Step 1: 写失败测试 `test/api.test.mjs`**

用例(全部走 `transformBody`):
1. `spark-x2.6` + `{"reasoning_effort":"high",...}` → 产出含 `"thinking":{"type":"enabled"}`,不含 `reasoning_effort`;
2. `spark-x2.6` + `"reasoning_effort":"none"`(及 `"minimal"`)→ `"thinking":{"type":"disabled"}`;
3. `spark-x2.6` 无 effort 字段 → 原样(不注入 thinking);
4. `xopglm52` + `{"thinking":{"type":"enabled"}}` → `thinking` 被移除,其余不变;
5. `xopglm52` + `"reasoning_effort":"max"` → 原样保留;
6. 任意模型 + 仅 `max_tokens` → 键名变 `max_completion_tokens`,值不变;两者同在 → 保留 `max_completion_tokens`、删除 `max_tokens`;
7. `model` 缺失或 body 非 JSON 字符串 → 返回原 body;
8. 深度相等:`tools` 数组(含 `{"type":"web_search","web_search":{"enable":true}}`)与 `messages`、`stream:true` 逐字段不变。
工厂用例:
9. `makePlugin("maas")` 的 `config` 用 `??=`:预填 `cfg.provider["xfyun-maas"] = { api: "custom" }` 后运行,原对象保留不被覆盖;空 cfg 时填入 name/npm=`@ai-sdk/openai-compatible`/api=`${ORIGINS.maas}/v2`/models 含 `spark-x2.6`;
10. `auth.methods[0]` 形如 `{type:"api", label, placeholder:"ak-…"}`;
11. loader:`getAuth` 返回 `{type:"api",key:"k"}` → `{baseURL:"…/v2", apiKey:"k", fetch:fn}`;返回 `undefined`/`{type:"api",key:"  "}` → `{}`;
12. `provider` 钩子 `id` 正确、`models(provider)` 返回与 config 相同的静态表。

- [ ] **Step 2: 运行确认失败** — `bun test test/api.test.mjs`

- [ ] **Step 3: 实现 `lib/api.mjs`**

- `isSpark(id)` = `/^(x?spark|auto$)/.test(id)`(coding 的 auto 走星火思考语义);
- `transformBody`:JSON.parse 成功才处理;按上面规则映射;`JSON.stringify` 回写;
- `makeFetch({ getKey, transform })`:async fetch — POST 且 content-type 含 json 时对 body 做 transform;`authorization: Bearer ${key}`(Headers 大小写不敏感 set);响应 401 → `new Response(res.body, { status, statusText, headers: 追加 X-Magpie-Sign-In: expired })`,其余响应原样返回;
- `makePlugin(line)`:组装 `{ config, auth: {...PROVIDER_META[line] 的 maxConcurrency}, provider }`,`loader(getAuth)` 缓存 `getAuth()` 结果供 fetch 用。

- [ ] **Step 4: 测试通过** — `bun test`

- [ ] **Step 5: Commit** — `git commit -m "feat: request transform, fetch wrapper, plugin factory"`

### Task 3: Mock 服务器 + fetch 集成测试

**Files:**
- Create: `test/mock/server.mjs`, `test/fetch.test.mjs`

**Interfaces:**
- Consumes: `makePlugin` 的 loader(Task 2)。
- Produces: `test/mock/server.mjs` 可独立启动:`node test/mock/server.mjs <port>`,实现 `POST /v2/chat/completions`(非流式 JSON、`stream:true` 时 SSE 两 chunk + `data: [DONE]`、可注入状态码 `?status=401|429` 与响应体)。

- [ ] **Step 1: 写失败测试 `test/fetch.test.mjs`**

beforeAll 启动 mock(随机端口),从 loader 拿 fetch 后实测:
1. Authorization 头到达服务器(`ak-test-key`);
2. SSE:两 chunk 逐块收到、顺序正确、结尾 `data: [DONE]`,且两次 `data:` 事件之间不合并(服务器分两次 flush + 50ms 间隔);
3. 401 注入:响应头含 `X-Magpie-Sign-In: expired`,status 401,正文与 mock 原文逐字节一致;
4. 429 原样透传(无 Sign-In 头),body 完整;
5. 请求体改写真实发生:发 `{"model":"spark-x2.6","max_tokens":8}`,服务器收到的 body 里是 `max_completion_tokens` 且无 `max_tokens`。

- [ ] **Step 2: 确认失败** → **Step 3: 实现 mock server + 通过** → **Step 4: `bun test` 全绿,commit** `feat: mock server and fetch integration tests`

### Task 4: 插件入口 + 宿主加载冒烟

**Files:**
- Create: `index.mjs`, `opencode.mjs`, `opencode2.mjs`, `scripts/check.mjs`
- Modify: `package.json`(files 补 `test/` 之外的必要项——test 不进 files)

**Interfaces:**
- Consumes: `makePlugin`(Task 2)、`opencode2.mjs` 上游副本(社区仓库 `scripts/opencode2.mjs`,curl 下载后**不做任何修改**)。
- Produces: 包入口(`opencode.mjs` 三函数 + `index.mjs` 的 `export const _internal = { transformBody, makePlugin, makeFetch }`);`scripts/check.mjs` 退出码 0/1。

- [ ] **Step 1: 写 `scripts/check.mjs`(仿社区 check 的断言,先跑会失败)**

加载 `opencode.mjs`:恰好 3 个导出且都是函数,无其它非函数导出;对每个插件函数:调 `fn({ client: stub, directory, worktree, project: {} })` 得钩子;`auth.provider` 与 config 填充的 key 一致;`auth.methods` 每项 type ∈ {api};`auth.loader` 是函数(coding 线再断言 `auth.maxConcurrency === 4`);config 产物有 `npm` 且 models 非空;`provider.models` 函数返回条数与表一致;`index.mjs` 的 `_internal` 三键齐全。任一失败 → exit 1 逐条打印。
- [ ] **Step 2: 确认失败** → **Step 3: 写 `index.mjs`(组装 _internal)/`opencode.mjs`(具名 re-export 三函数)/`opencode2.mjs`(下载副本,校验与上游 sha 一致)** → **Step 4: `bun test && bun scripts/check.mjs` 全绿** → **Step 5: commit** `feat: plugin entries and host-shape check`

### Task 5: magpie CLI 沙箱 E2E(加载/登录/401 路径)

**Files:**
- Create: `scripts/e2e-magpie.sh`(可重复执行的沙箱脚本,不入 files)

**Interfaces:**
- Consumes: 仓库根文件夹本体(`magpie plugin add ./…`)。
- Produces: 本机 `tools/magpie.exe`(下载产物,gitignore);沙箱输出记录。

- [ ] **Step 1: 下载 magpie Windows CLI**

从 `https://github.com/yetone/magpie-releases/releases/latest` 取 `magpie-windows-amd64.exe` → `tools/magpie.exe`(`.gitignore` 加 `tools/`)。

- [ ] **Step 2: 沙箱加载与登录**

```bash
sb=$(mktemp -d)
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config MAGPIE_ADDR=127.0.0.1:3499 ./tools/magpie.exe "$@"; }
m plugin add "$(pwd)" </dev/null
m plugin --json   # 断言:三个 provider 出现,各带 models 数量,无加载错误
printf 'ak-e2e-fake-key\n' | m plugin login xfyun-maas
m plugin          # 断言:xfyun-maas 显示已登录账号
```

- [ ] **Step 3: 401 真实路径验证**

`m provider test xfyun-maas` 用假 key 必然 401:断言输出里出现登录失效/401 语义(magpie 侧体现 `X-Magpie-Sign-In` 或 401 处理),且不是插件崩溃或超时。
- [ ] **Step 4: 三条线重复 Step 2(coding/token 登录用假 key 各一次)** → **Step 5: 把关键输出存档 `docs/e2e-log.md`,commit** `test: magpie sandbox E2E for load, login and 401 path`

### Task 6: README、图标、双语文档

**Files:**
- Create: `README.md`(英文,主)、`README.zh-CN.md`
- Modify: `package.json`(`magpie.icon` = icon.svg 的 data URI;base64 后 < 1MB)、`icon.svg` 定稿

- [ ] **Step 1: 写 README**(npm 详情页即 magpie 详情页,内容清单:三个供应商各自登录什么/key 在控制台哪里拿/模型列表与抵扣系数表/计费与流控差异说明/用量在控制台查看、插件不做 usage 钩子/OpenCode 兼容属尽力而为/magpie 安装用法/致谢与免责声明(非官方, trademarks 归讯飞))。
- [ ] **Step 2: zh-CN 版对齐翻译;`magpie.name: "讯飞星辰 MaaS"`(≤80 字节)、`magpie.summary` 中英各一行。**
- [ ] **Step 3: base64 编码 icon.svg 填入 `magpie.icon`** → **Step 4: `bun test && bun scripts/check.mjs` 仍绿** → **Step 5: commit** `docs: bilingual README, icon, package metadata`

### Task 7: CI 与发布流水线(GitHub Actions + npm provenance)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: `ci.yml`** — push/PR 触发:`oven-sh/setup-bun` → `bun test` → `bun scripts/check.mjs`(矩阵:windows-latest + ubuntu-latest)。
- [ ] **Step 2: `release.yml`** — `on: push: tags: ["v*"]`:CI 通过后 `npm publish --provenance`(needs `NPM_TOKEN` secret + `id: write` 权限;node 22)。
- [ ] **Step 3: 本地演练** — `git tag v0.0.0-dryrun`(不推);`npm publish --dry-run` 检查 files 列表、无多余文件、tarball 含三个入口。
- [ ] **Step 4: commit** `ci: test workflow and tagged npm release with provenance`

### Task 8: 真机验证 + 上架(依赖外部输入)

**状态:阻塞——等待用户提供 API key(部分产品线)与 GitHub 账号/仓库名、npm token 配置。**

- [ ] **Step 1: 拿到 key 后逐线探测**:`GET {origin}/v2/models`(Bearer)验证未公开文档的模型列表端点;每线抽 2–3 个代表模型真机 `provider test` + 一次流式对话 + thinking/工具调用各一次;核对 `spark-x2.6` 的 `reasoning_effort` 是否被接受,据此决定 v0.1.1 是否加 `variants`;修正 output 上限与(若 /v2/models 可用)增补模型。
- [ ] **Step 2: 修正模型表并回归** `bun test`。
- [ ] **Step 3: 发布**:建 GitHub 仓库(名字默认 `opencode-xfyun-maas-auth`,topic `magpie-plugin`)→ 推送 → 配 `NPM_TOKEN` secret → `git tag v0.1.0 && git push --tags` → Actions 自动 publish(provenance)。
- [ ] **Step 4: registry PR**:fork `magpie-community/plugins`,按 spec 的条目 JSON 加一项(icon 用本仓库 raw URL),提交 PR;PR 文案模板随包放在 `docs/registry-pr.md`。
