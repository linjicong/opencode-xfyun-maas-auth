# 上架材料:registry.json 收录 PR

目标仓库:[magpie-community/plugins](https://github.com/magpie-community/plugins) 的 `registry.json`。
图标 URL 在 GitHub 仓库创建后填入 `linjicong`。

## 条目(追加到 plugins 数组,按字母序插到合适位置)

```json
{ "package": "opencode-xfyun-maas-auth", "name": "讯飞星辰 MaaS", "providers": ["xfyun-maas", "xfyun-coding", "xfyun-token"],
  "summary": { "en": "iFlytek Xfyun MaaS: Spark, GLM, DeepSeek, Kimi, Qwen and more — pay-as-you-go, Coding Plan and Token Plan.",
               "zh": "讯飞星辰 MaaS:星火、GLM、DeepSeek、Kimi、Qwen 等模型,按量付费与 Coding/Token 套餐。" } }
```

说明:icon 可省略(条目里没写就显示默认拼图图标),或用仓库 raw URL:

```json
"icon": "https://raw.githubusercontent.com/linjicong/opencode-xfyun-maas-auth/main/icon.svg"
```

## PR 标题

```
Add opencode-xfyun-maas-auth (Xfyun MaaS: pay-as-you-go, Coding Plan, Token Plan)
```

## PR 描述模板

```markdown
Adds `opencode-xfyun-maas-auth` — one npm package, three providers for iFlytek's
Xfyun MaaS platform (maas.xfyun.cn):

- `xfyun-maas` — pay-as-you-go API key (`ak-…`): Spark X2.6/X2.5 family plus the
  open-source catalog (GLM-5.x, DeepSeek-V4, Kimi-K2.x, Qwen3.x, MiniMax…)
- `xfyun-coding` — Astron Coding Plan key: xsparkx2agent/xsparkx2/xsparkx2flash/auto
  + plan models, with the official credit multipliers (rate 1–5)
- `xfyun-token` — Astron Token Plan key: plan models billed per token in credits

All three speak OpenAI Chat Completions through @ai-sdk/openai-compatible
(`POST /v2/chat/completions` on each product line's gateway host); the plugin
translates OpenAI-style `reasoning_effort` to Spark's `thinking` object,
renames the deprecated `max_tokens`, and reports 401s via X-Magpie-Sign-In.
Model tables are transcribed from the official docs (offline models excluded).
Xfyun publishes no usage API, so there is no usage hook — quotas live in the
console (noted in the README).

- npm: https://www.npmjs.com/package/opencode-xfyun-maas-auth
- repo: https://github.com/linjicong/opencode-xfyun-maas-auth (topic: magpie-plugin)
- tested against magpie 0.1.3386 (sandbox load/login/provider-test E2E in the repo)
```

## 提交流程(需要 GitHub 账号)

1. fork `magpie-community/plugins` → clone fork
2. 在 `registry.json` 的 `plugins` 数组按字母序插入上面条目
3. commit + push + 向上游开 PR(用上面的标题与描述)
4. 等维护者审核(社区仓库一般会跑 scripts/check.mjs 校验条目)
