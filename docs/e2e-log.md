# magpie 沙箱 E2E 记录

日期:2026-11-09 · magpie 0.1.3386 (magpie-cli-windows-amd64.exe) · 仓库文件夹加载

## 结果(run 2,修复 provider.models 形状后)

- `plugin add ./` → ✓ 三个供应商加载:xfyun-maas(32 模型)/xfyun-coding(19)/xfyun-token(14),api 与 methods 正确
- `plugin --json` → reasoning/url/rate 全部正确呈现(如 xsparkx2agent: reasoning true, rate 2)
- `plugin login` ×3(假 key)→ ✓ signed in
- `provider test xfyun-maas`(假 key)→ 真实网关 401「HMAC signature cannot be verified: apikey not found」,magpie 干净处理,无崩溃

## run 1 发现并修复的问题

- provider.models 钩子最初返回 config 形状,magpie 规范化后 reasoning 丢失且 api.url 为空;改为展开 magpie 传入的内部条目(文档推荐写法),TDD 修复。

原始日志:仓库外 /tmp/e2e-run2.log(本文件为摘要)。

## 真机验证(2026-11-09,按量付费线,真 key)

- `GET /v2/models` → 200,返回**该 key 的授权模型**(此 key 仅 spark-x2.6)——
  未见于文档的端点真实存在,且模型按 key 授权。
- 非流式对话 200:默认开思考(`reasoning_content` 有值);`thinking:{type:"disabled"}`
  后直答、无思考;裸 `reasoning_effort` 网关宽容接受(不 400)。
- 流式 SSE 正常(chunk 带 `delta.content`);function calling 正常
  (`finish_reason:"tool_calls"`,arguments 结构标准)。
- `xopglm52` → 403 code 11200「no valid authorization」——确认按 key 授权。
- magpie 沙箱真 key 全链路:`plugin login` ✓、`provider test xfyun-maas` →
  **✓ chat 2128 ms · spark-x2.6**(magpie 网关→插件→讯飞真实往返);
  `plugin --json` 该账号模型恰好为 `['spark-x2.6']`(动态发现生效)。
