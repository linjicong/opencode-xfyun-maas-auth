// Model tables for the three iFlytek Xfyun MaaS product lines.
//
// Sources (official docs, verified 2026-11-09):
//   maas   — https://maas.xfyun.cn/doc/guide/2、模型介绍/2.1 星火模型 + 2.1.1 Spark-X2.6 + 2.2 开源模型
//   coding — https://maas.xfyun.cn/doc/guide/5、套餐订阅/5.1 Codingplan  (rate = 抵扣系数)
//   token  — https://maas.xfyun.cn/doc/guide/5、套餐订阅/5.2 Tokenplan
// Offline models (【260930下线】/【261009下线】/已下线), embeddings, rerankers and
// OCR-only models are excluded. Output limits are not published; they follow the
// plan's rule: ctx >= 1M -> 65536, 33K..256K -> 32768, <= 32K -> 16384.

export const ORIGINS = {
  maas: "https://maas-api.cn-huabei-1.xf-yun.com",
  coding: "https://maas-coding-api.cn-huabei-1.xf-yun.com",
  token: "https://maas-token-api.cn-huabei-1.xf-yun.com",
}

export const PROVIDER_META = {
  maas: {
    id: "xfyun-maas",
    name: "讯飞星辰 MaaS",
    label: "MaaS API Key",
  },
  coding: {
    id: "xfyun-coding",
    name: "讯飞 Coding Plan",
    label: "Coding Plan API Key",
    maxConcurrency: 4,
  },
  token: {
    id: "xfyun-token",
    name: "讯飞 Token Plan",
    label: "Token Plan API Key",
  },
}

const M = (id, name, ctxK, out, extra = {}) =>
  out === undefined
    ? { id, name, ctx: ctxK * 1024, out: outputFor(ctxK), ...extra }
    : { id, name, ctx: ctxK * 1024, out, ...extra }

function outputFor(ctxK) {
  if (ctxK >= 1024) return 65536
  if (ctxK > 32) return 32768
  return 16384
}

// ---- pay-as-you-go (maas-api) ---------------------------------------------
// reasoning: spark* (thinking param), xopglm5*, xopdeepseekv4*, R1 distill.
export const MAAS_MODELS = [
  M("spark-x2.6", "Spark X2.6", 1024, undefined, { reasoning: true }),
  M("spark-x2.6-4b", "Spark X2.6-4B", 1024, undefined, { reasoning: true }),
  M("spark-x2.6-preview", "Spark X2.6 Preview", 256),
  M("spark-x2.5", "Spark X2.5", 256, undefined, { reasoning: true }),
  M("spark-x2.5-4b", "Spark X2.5-4B", 1024, undefined, { reasoning: true }),
  M("spark-x2.5-1.7b", "Spark X2.5-1.7B", 1024, undefined, { reasoning: true }),
  M("xopglm53", "GLM-5.3", 1024, undefined, { reasoning: true }),
  M("xopdeepseekv4pro0813", "DeepSeek-V4-Pro-0813", 1024, undefined, { reasoning: true }),
  M("xopdeepseekv4flash0731", "DeepSeek-V4-Flash-0731", 1024, undefined, { reasoning: true }),
  M("xopkimik27code", "Kimi-K2.7-Code", 256),
  M("xopglm52", "GLM-5.2", 1024, undefined, { reasoning: true }),
  M("xopkimik26", "Kimi-K2.6", 256),
  M("xopdeepseekv4pro", "DeepSeek-V4-Pro", 1024, undefined, { reasoning: true }),
  M("xopqwen36v35b", "Qwen3.6-35B-A3B", 128),
  M("xopglm51", "GLM-5.1", 200, undefined, { reasoning: true }),
  M("xop35qwen2b", "Qwen3.5-2B", 32),
  M("xop3qwencodernext", "Qwen3-Coder-Next-FP8", 256),
  M("xopqwen35397b", "Qwen3.5-397B-A17B", 256),
  M("xminimaxm25", "MiniMax-M2.5", 128),
  M("xopglm5", "GLM-5", 200, undefined, { reasoning: true }),
  M("xopkimik25", "Kimi-K2.5", 128),
  M("xopglmv47flash", "GLM-4.7-Flash", 128),
  M("xop3qwen80bnext", "Qwen3-Next-80B-A3B-Instruct", 256),
  M("xop3qwen235b2507", "Qwen3-235B-A22B-Instruct-2507", 64),
  M("xop3qwen32b", "Qwen3-32B", 32),
  M("xop3qwen14b", "Qwen3-14B", 16),
  M("xop3qwen8b", "Qwen3-8B", 16),
  M("xop3qwen4b", "Qwen3-4B", 16),
  M("xop3qwen0b6", "Qwen3-0.6B", 32),
  M("xdeepseekr1qwen32b", "DeepSeek-R1-Distill-Qwen-32B", 8, undefined, { reasoning: true }),
  M("xqwen257bchat", "Qwen2.5-7B-Instruct", 8),
  M("xqwen14bchat", "Qwen-v2.5-14B-Instruct", 8),
]

// ---- Coding Plan (maas-coding-api) -----------------------------------------
// rate = 抵扣系数 (5.1, purchases from 2026-07-23). Contexts come from the
// Token Plan table (5.2) where the same modelId is listed there; the
// spark/auto entries without published context default to 256K except
// Spark-X2 (192K, from 5.2). xopdeepseekv4flash/v32 reuse their maas-table
// contexts (1M / 128K).
export const CODING_MODELS = [
  M("xsparkx2agent", "Spark X2 Agent", 256, undefined, { reasoning: true, rate: 2 }),
  M("xsparkx2", "Spark X2", 192, undefined, { reasoning: true, rate: 2 }),
  M("xsparkx2flash", "Spark X2 Flash", 256, undefined, { reasoning: true, rate: 1 }),
  M("auto", "Auto", 256, undefined, { reasoning: true, rate: 2 }),
  M("xopglm52", "GLM-5.2", 1024, undefined, { reasoning: true, rate: 5 }),
  M("xopglm51", "GLM-5.1", 200, undefined, { reasoning: true, rate: 4 }),
  M("xopglm5", "GLM-5", 200, undefined, { reasoning: true, rate: 3 }),
  M("xopdeepseekv4pro", "DeepSeek-V4-Pro", 1024, undefined, { reasoning: true, rate: 5 }),
  M("xopdeepseekv4flash", "DeepSeek-V4-Flash", 1024, undefined, { reasoning: true, rate: 2 }),
  M("xopdeepseekv32", "DeepSeek-V3.2", 128, undefined, { rate: 2 }),
  M("xopkimi27code", "Kimi-K2.7-Code", 256, undefined, { rate: 5 }),
  M("xopkimik26", "Kimi-K2.6", 256, undefined, { rate: 4 }),
  M("xopkimik25", "Kimi-K2.5", 128, undefined, { rate: 3 }),
  M("xminimaxm25", "MiniMax-M2.5", 128, undefined, { rate: 2 }),
  M("xopqwen35397b", "Qwen3.5-397B-A17B", 256, undefined, { rate: 2 }),
  M("xopqwen36v35b", "Qwen3.6-35B-A3B", 128, undefined, { rate: 1 }),
  M("xopqwen35v35b", "Qwen3.5-35B-A3B", 128, undefined, { rate: 1 }),
  M("xop3qwencodernext", "Qwen3-Coder-Next-FP8", 256, undefined, { rate: 1 }),
  M("xopglmv47flash", "GLM-4.7-Flash", 128, undefined, { rate: 1 }),
]

// ---- Token Plan (maas-token-api) -------------------------------------------
// Contexts from the 5.2 table; every plan model bills thinking tokens, so
// reasoning: true across the board.
export const TOKEN_MODELS = [
  M("spark-x2.5", "Spark X2.5", 256, undefined, { reasoning: true }),
  M("xsparkx2flash", "Spark X2 Flash", 256, undefined, { reasoning: true }),
  M("xopglm52", "GLM-5.2", 1024, undefined, { reasoning: true }),
  M("xopglm51", "GLM-5.1", 200, undefined, { reasoning: true }),
  M("xopglm5", "GLM-5", 200, undefined, { reasoning: true }),
  M("xopdeepseekv4pro", "DeepSeek-V4-Pro", 1024, undefined, { reasoning: true }),
  M("xopkimik26", "Kimi-K2.6", 256, undefined, { reasoning: true }),
  M("xopkimik25", "Kimi-K2.5", 128, undefined, { reasoning: true }),
  M("xminimaxm25", "MiniMax-M2.5", 128, undefined, { reasoning: true }),
  M("xopqwen35397b", "Qwen3.5-397B-A17B", 256, undefined, { reasoning: true }),
  M("xopqwen36v35b", "Qwen3.6-35B-A3B", 128, undefined, { reasoning: true }),
  M("xopqwen35v35b", "Qwen3.5-35B-A3B", 128, undefined, { reasoning: true }),
  M("xop3qwencodernext", "Qwen3-Coder-Next-FP8", 256, undefined, { reasoning: true }),
  M("xopglmv47flash", "GLM-4.7-Flash", 128, undefined, { reasoning: true }),
]

export const MODELS = {
  maas: MAAS_MODELS,
  coding: CODING_MODELS,
  token: TOKEN_MODELS,
}

// toProviderModels turns a table into the config-hook shape magpie/OpenCode
// expect: { [id]: { name, limit, reasoning?, tool_call, rate? } }.
export function toProviderModels(list) {
  return Object.fromEntries(
    list.map((m) => [
      m.id,
      {
        name: m.name,
        limit: { context: m.ctx, output: m.out },
        ...(m.reasoning ? { reasoning: true } : {}),
        tool_call: true,
        ...(m.rate !== undefined ? { rate: m.rate } : {}),
      },
    ]),
  )
}
