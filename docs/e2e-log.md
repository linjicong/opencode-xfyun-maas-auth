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
