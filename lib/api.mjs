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

// makePlugin(line) builds the OpenCode v1 plugin function for one product
// line ("maas" | "coding" | "token").
export function makePlugin(line) {
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
        // our table owns, and pass entries we don't know straight through;
        // hosts that pass something else get the static config table.
        async models(provider, _ctx) {
          const incoming = provider?.models
          if (!incoming || typeof incoming !== "object") return models
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
          return known > 0 ? out : models
        },
      },
    }
  }
}
