// The API layer: request-body translation for the Xfyun MaaS gateway, a
// fetch wrapper that signs and inspects every request, and the plugin
// factory shared by the three product lines.
//
// Xfyun facts this file encodes (docs 3.1.1 Chat / 3.2.1 文本对话):
//   - `max_tokens` is deprecated; the gateway wants `max_completion_tokens`.
//   - Spark models (spark*/xspark*/auto) control thinking with
//     `thinking: {type: "enabled"|"disabled"|"auto"}` and do not document
//     `reasoning_effort`/`enable_thinking`.
//   - Open-source models (xop*/x…*) take `enable_thinking` +
//     `reasoning_effort` ("high"/"max") and have no `thinking` object.
//   - 401 means the API key is wrong (docs 1.2), so it is reported to
//     magpie through the X-Magpie-Sign-In response header.

import { MODELS, ORIGINS, PROVIDER_META, toProviderModels } from "./models.mjs"

const SDK_NPM = "@ai-sdk/openai-compatible"

const isSpark = (id) => id === "auto" || /^x?spark/.test(id)

const DISABLING_EFFORTS = new Set(["none", "minimal", "off", "disable", "disabled"])

function thinkingType(effort) {
  return DISABLING_EFFORTS.has(String(effort).toLowerCase()) ? "disabled" : "enabled"
}

// transformBody(modelId, body) rewrites a chat-completions JSON body for the
// model family it addresses. Anything it cannot classify comes back
// byte-for-byte unchanged.
export function transformBody(modelId, body) {
  if (typeof body !== "string" || !body) return body
  if (typeof modelId !== "string" || !modelId) return body

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body

  let changed = false

  // max_tokens -> max_completion_tokens (the new name wins when both exist)
  if ("max_tokens" in parsed) {
    if (parsed.max_completion_tokens === undefined) parsed.max_completion_tokens = parsed.max_tokens
    delete parsed.max_tokens
    changed = true
  }

  if (isSpark(modelId)) {
    if ("reasoning_effort" in parsed) {
      if (parsed.thinking === undefined) parsed.thinking = { type: thinkingType(parsed.reasoning_effort) }
      delete parsed.reasoning_effort
      changed = true
    }
    if ("enable_thinking" in parsed) {
      if (parsed.thinking === undefined) parsed.thinking = { type: parsed.enable_thinking === false ? "disabled" : "enabled" }
      delete parsed.enable_thinking
      changed = true
    }
  } else if ("thinking" in parsed) {
    delete parsed.thinking
    changed = true
  }

  return changed ? JSON.stringify(parsed) : body
}

function modelOf(body) {
  if (typeof body !== "string" || !body) return undefined
  try {
    const parsed = JSON.parse(body)
    return typeof parsed?.model === "string" ? parsed.model : undefined
  } catch {
    return undefined
  }
}

// makeFetch(key) returns a fetch that signs every request with the account's
// key, translates the request body for the addressed model, and tags 401
// answers as an expired sign-in for magpie. Responses stream through as-is.
export function makeFetch(key) {
  return async function xfyunFetch(input, init = {}) {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : input
    const method = init.method ?? req?.method ?? "GET"

    let body = init.body ?? req?.body
    if (typeof body !== "string" && req && init.body === undefined && method !== "GET" && method !== "HEAD") {
      body = await req.text()
    }
    if (typeof body === "string" && method === "POST") {
      body = transformBody(modelOf(body), body)
    }

    const headers = new Headers(init.headers ?? req?.headers ?? undefined)
    if (key) headers.set("authorization", `Bearer ${key}`)

    const res = await globalThis.fetch(url, { ...init, method, headers, body, signal: init.signal ?? req?.signal })
    if (res.status !== 401) return res

    const out = new Headers(res.headers)
    out.set("x-magpie-sign-in", "expired")
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
  }
}

// fetchLiveModelIds asks the gateway which models this key may use
// (GET /v2/models — undocumented but live-verified). Any failure returns
// null so callers fall back to the static table; an empty list also falls
// back, because serving nothing is never the right answer.
export async function fetchLiveModelIds(origin, key, fetchImpl = globalThis.fetch) {
  if (!key) return null
  try {
    const res = await fetchImpl(`${origin}/v2/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const ids = Array.isArray(data?.data)
      ? data.data.map((m) => (typeof m?.id === "string" && m.id ? m.id : null)).filter(Boolean)
      : []
    return ids.length ? ids : null
  } catch {
    return null
  }
}

const GENERIC_MODEL = { context: 131_072, output: 16_384 }

function genericModel(id, base) {
  return {
    id,
    name: id,
    api: { id, url: base, npm: SDK_NPM },
    limit: { ...GENERIC_MODEL },
    capabilities: { reasoning: false, toolcall: true, attachment: false, input: { text: true } },
  }
}

// makePlugin(line) builds the OpenCode v1 plugin function for one product
// line ("maas" | "coding" | "token"). deps.fetch is injectable for tests.
export function makePlugin(line, deps = {}) {
  const meta = PROVIDER_META[line]
  const origin = ORIGINS[line]
  const base = `${origin}/v2`
  const models = toProviderModels(MODELS[line])

  return async function plugin(_input) {
    return {
      config: async (cfg) => {
        cfg.provider ??= {}
        cfg.provider[meta.id] ??= {
          name: meta.name,
          npm: SDK_NPM,
          api: base,
          models,
        }
      },

      auth: {
        provider: meta.id,
        methods: [{ type: "api", label: meta.label, placeholder: "ak-…" }],
        ...(meta.maxConcurrency ? { maxConcurrency: meta.maxConcurrency } : {}),
        async loader(getAuth) {
          const auth = await getAuth()
          const key = auth?.type === "api" && typeof auth.key === "string" ? auth.key.trim() : ""
          if (!key) return {}
          return { baseURL: base, apiKey: key, fetch: makeFetch(key) }
        },
      },

      provider: {
        id: meta.id,
        // magpie hands the hook internal-form models derived from our config
        // (capabilities, api, release info) — which includes models the user
        // added to their own provider entry. Spread each entry, pin only what
        // our table owns, and pass entries we don't know straight through.
        // When the account carries a key, the gateway's own /v2/models list
        // decides which of those the account actually serves (Xfyun
        // authorizes models per key); unknown-but-authorized ids get a
        // generic entry. Hosts that pass something else get the static
        // config table.
        async models(provider, ctx) {
          const incoming = provider?.models
          let merged = null
          if (incoming && typeof incoming === "object") {
            const out = {}
            let known = 0
            for (const [id, internal] of Object.entries(incoming)) {
              if (!internal || typeof internal !== "object" || !internal.api) continue
              const mine = models[id]
              if (!mine) {
                out[id] = internal
                continue
              }
              known++
              out[id] = {
                ...internal,
                name: mine.name,
                limit: { ...internal.limit, context: mine.limit.context, output: mine.limit.output },
                ...(mine.rate !== undefined ? { rate: mine.rate } : {}),
              }
            }
            if (known > 0) merged = out
          }
          if (merged === null) merged = models

          const auth = ctx?.auth
          const key = auth?.type === "api" && typeof auth.key === "string" ? auth.key.trim() : ""
          if (!key) return merged
          const live = await fetchLiveModelIds(origin, key, deps.fetch)
          if (!live) return merged
          const out = {}
          for (const id of live) out[id] = merged[id] ?? genericModel(id, base)
          return out
        },
      },
    }
  }
}
