import { describe, expect, test } from "bun:test"
import { MODELS, toProviderModels } from "../lib/models.mjs"
import { fetchLiveModelIds, makePlugin, transformBody } from "../lib/api.mjs"

const json = (s) => JSON.parse(s)

describe("transformBody", () => {
  test("spark model maps reasoning_effort to thinking enabled", () => {
    const out = json(transformBody("spark-x2.6", JSON.stringify({ model: "spark-x2.6", messages: [], reasoning_effort: "high" })))
    expect(out.thinking).toEqual({ type: "enabled" })
    expect("reasoning_effort" in out).toBe(false)
  })

  test("spark model maps none/minimal effort to thinking disabled", () => {
    for (const effort of ["none", "minimal"]) {
      const out = json(transformBody("spark-x2.5", JSON.stringify({ model: "spark-x2.5", reasoning_effort: effort })))
      expect(out.thinking).toEqual({ type: "disabled" })
      expect("reasoning_effort" in out).toBe(false)
    }
  })

  test("spark model without effort fields stays untouched", () => {
    const body = JSON.stringify({ model: "spark-x2.6", messages: [{ role: "user", content: "hi" }], stream: true })
    expect(transformBody("spark-x2.6", body)).toBe(body)
  })

  test("auto routes follow spark thinking semantics", () => {
    const out = json(transformBody("auto", JSON.stringify({ model: "auto", reasoning_effort: "high" })))
    expect(out.thinking).toEqual({ type: "enabled" })
  })

  test("non-spark model drops the thinking object, keeps the rest", () => {
    const out = json(transformBody("xopglm52", JSON.stringify({ model: "xopglm52", thinking: { type: "enabled" }, temperature: 0.5 })))
    expect("thinking" in out).toBe(false)
    expect(out.temperature).toBe(0.5)
  })

  test("non-spark model keeps reasoning_effort as-is", () => {
    const body = JSON.stringify({ model: "xopglm52", reasoning_effort: "max" })
    expect(transformBody("xopglm52", body)).toBe(body)
  })

  test("max_tokens renamed to max_completion_tokens; both present keeps the new one", () => {
    const a = json(transformBody("xopglm52", JSON.stringify({ model: "xopglm52", max_tokens: 512 })))
    expect(a.max_completion_tokens).toBe(512)
    expect("max_tokens" in a).toBe(false)
    const b = json(transformBody("spark-x2.6", JSON.stringify({ model: "spark-x2.6", max_tokens: 8, max_completion_tokens: 64 })))
    expect(b.max_completion_tokens).toBe(64)
    expect("max_tokens" in b).toBe(false)
  })

  test("missing model or non-JSON body returns the body unchanged", () => {
    const notJson = "not-json-at-all"
    expect(transformBody("xopglm52", notJson)).toBe(notJson)
    expect(transformBody(undefined, JSON.stringify({ messages: [] }))).toBe(JSON.stringify({ messages: [] }))
    expect(transformBody("xopglm52", undefined)).toBeUndefined()
  })

  test("tools with web_search, messages and stream survive untouched", () => {
    const body = {
      model: "spark-x2.6",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      tools: [
        { type: "function", function: { name: "get_weather", description: "weather", parameters: { type: "object" }, required: ["city"] } },
        { type: "web_search", web_search: { enable: true } },
      ],
      tool_choice: "auto",
    }
    const out = json(transformBody("spark-x2.6", JSON.stringify(body)))
    expect(out.messages).toEqual(body.messages)
    expect(out.tools).toEqual(body.tools)
    expect(out.tool_choice).toBe("auto")
    expect(out.stream).toBe(true)
  })
})

describe("fetchLiveModelIds", () => {
  const res = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })

  test("parses an OpenAI-style model list", async () => {
    const ids = await fetchLiveModelIds("https://x.example", "k", async () => res(200, { object: "list", data: [{ id: "spark-x2.6" }, { id: "xopglm52" }] }))
    expect(ids).toEqual(["spark-x2.6", "xopglm52"])
  })

  test("returns null on any failure (non-200, bad JSON, network)", async () => {
    expect(await fetchLiveModelIds("https://x.example", "k", async () => res(401, { code: 401 }))).toBeNull()
    expect(await fetchLiveModelIds("https://x.example", "k", async () => res(200, "not-json"))).toBeNull()
    expect(await fetchLiveModelIds("https://x.example", "k", async () => { throw new Error("boom") })).toBeNull()
    expect(await fetchLiveModelIds("https://x.example", "  ", async () => res(200, { data: [] }))).toBeNull()
  })
})

describe("makePlugin", () => {
  const load = async (line) => {
    const hooks = await makePlugin(line)({ client: {}, directory: ".", worktree: ".", project: {} })
    expect(hooks).toBeTruthy()
    return hooks
  }

  test("config uses ??=: a pre-filled provider entry is preserved", async () => {
    const hooks = await load("maas")
    const cfg = { provider: { "xfyun-maas": { api: "custom" } } }
    await hooks.config(cfg)
    expect(cfg.provider["xfyun-maas"]).toEqual({ api: "custom" })
  })

  test("config fills name, npm, api and models on an empty cfg", async () => {
    const hooks = await load("maas")
    const cfg = { provider: {} }
    await hooks.config(cfg)
    const p = cfg.provider["xfyun-maas"]
    expect(p.name).toBe("讯飞星辰 MaaS")
    expect(p.npm).toBe("@ai-sdk/openai-compatible")
    expect(p.api).toBe("https://maas-api.cn-huabei-1.xf-yun.com/v2")
    expect(Object.keys(p.models)).toEqual(Object.keys(toProviderModels(MODELS.maas)))
    expect(p.models["spark-x2.6"].limit.context).toBe(1048576)
  })

  test("auth method is an api-key prompt with ak- placeholder", async () => {
    const hooks = await load("coding")
    expect(hooks.auth.provider).toBe("xfyun-coding")
    expect(hooks.auth.methods).toEqual([{ type: "api", label: "Coding Plan API Key", placeholder: "ak-…" }])
    expect(hooks.auth.maxConcurrency).toBe(4)
    expect(typeof hooks.auth.loader).toBe("function")
  })

  test("loader with a valid key returns baseURL, apiKey and a fetch function", async () => {
    const hooks = await load("token")
    const loader = await hooks.auth.loader(async () => ({ type: "api", key: "k" }))
    expect(loader.baseURL).toBe("https://maas-token-api.cn-huabei-1.xf-yun.com/v2")
    expect(loader.apiKey).toBe("k")
    expect(typeof loader.fetch).toBe("function")
  })

  test("loader returns {} for missing auth and blank keys", async () => {
    const hooks = await load("maas")
    expect(await hooks.auth.loader(async () => undefined)).toEqual({})
    expect(await hooks.auth.loader(async () => ({ type: "api", key: "   " }))).toEqual({})
    expect(await hooks.auth.loader(async () => ({ type: "oauth", access: "x" }))).toEqual({})
  })

  test("provider hook merges user-added models through instead of dropping them", async () => {
    const hooks = await load("maas")
    const cfg = { provider: {} }
    await hooks.config(cfg)
    const base = toProviderModels(MODELS.maas)
    const incoming = {}
    for (const [id, m] of Object.entries(base)) {
      incoming[id] = {
        ...m,
        id,
        api: { id, url: "https://example.invalid/v2", npm: "@ai-sdk/openai-compatible" },
        capabilities: { reasoning: m.reasoning === true, toolcall: true, attachment: false, input: { text: true } },
      }
    }
    // a model the user added to their own provider config — not in our table
    incoming["my-custom-model"] = {
      id: "my-custom-model",
      name: "My Custom",
      api: { id: "my-custom-model", url: "https://example.invalid/v2", npm: "@ai-sdk/openai-compatible" },
      limit: { context: 8192, output: 4096 },
      capabilities: { reasoning: false, toolcall: true, attachment: false, input: { text: true } },
    }
    const listed = await hooks.provider.models({ id: "xfyun-maas", models: incoming })
    expect(listed["my-custom-model"]).toEqual(incoming["my-custom-model"])
    expect(listed["spark-x2.6"].name).toBe("Spark X2.6")
    expect(Object.keys(listed).length).toBe(Object.keys(incoming).length)
  })

  test("provider.models with a live /v2/models list serves exactly the authorized ids", async () => {
    const liveFetch = async () => new Response(JSON.stringify({ object: "list", data: [{ id: "spark-x2.6" }, { id: "brand-new-model" }] }), { status: 200 })
    const hooks = await makePlugin("maas", { fetch: liveFetch })({ client: {}, directory: ".", worktree: ".", project: {} })
    const incoming = {}
    for (const [id, m] of Object.entries(toProviderModels(MODELS.maas))) {
      incoming[id] = {
        ...m,
        id,
        api: { id, url: "https://example.invalid/v2", npm: "@ai-sdk/openai-compatible" },
        capabilities: { reasoning: m.reasoning === true, toolcall: true, attachment: false, input: { text: true } },
      }
    }
    const listed = await hooks.provider.models({ id: "xfyun-maas", models: incoming }, { auth: { type: "api", key: "k" } })
    expect(Object.keys(listed).sort()).toEqual(["brand-new-model", "spark-x2.6"])
    expect(listed["spark-x2.6"].name).toBe("Spark X2.6")
    expect(listed["spark-x2.6"].limit.context).toBe(1048576)
    expect(listed["brand-new-model"].name).toBe("brand-new-model")
    expect(listed["brand-new-model"].api.npm).toBe("@ai-sdk/openai-compatible")
    expect(listed["brand-new-model"].capabilities.toolcall).toBe(true)
  })

  test("provider.models falls back to the static table when the live list fails", async () => {
    const deadFetch = async () => { throw new Error("network down") }
    const hooks = await makePlugin("maas", { fetch: deadFetch })({ client: {}, directory: ".", worktree: ".", project: {} })
    const incoming = {}
    for (const [id, m] of Object.entries(toProviderModels(MODELS.maas))) {
      incoming[id] = { ...m, id, api: { id, url: "u", npm: "n" }, capabilities: { reasoning: false, toolcall: true, attachment: false, input: { text: true } } }
    }
    const listed = await hooks.provider.models({ id: "xfyun-maas", models: incoming }, { auth: { type: "api", key: "k" } })
    expect(Object.keys(listed).length).toBe(MODELS.maas.length)
  })

  test("provider hook echoes the static table for its line", async () => {
    for (const line of ["maas", "coding", "token"]) {
      const hooks = await load(line)
      const cfg = { provider: {} }
      await hooks.config(cfg)
      // magpie hands the hook internal-form models derived from our config;
      // the hook must spread them (capabilities, api) and only pin our values.
      const incoming = {}
      for (const [id, m] of Object.entries(toProviderModels(MODELS[line]))) {
        incoming[id] = {
          ...m,
          id,
          api: { id, url: "https://example.invalid/v2", npm: "@ai-sdk/openai-compatible" },
          capabilities: { reasoning: m.reasoning === true, toolcall: true, attachment: false, input: { text: true } },
        }
      }
      const listed = await hooks.provider.models({ id: hooks.auth.provider, models: incoming })
      const entry = listed["spark-x2.6"] ?? listed["xsparkx2agent"] ?? listed["spark-x2.5"]
      expect(entry.capabilities.reasoning).toBe(true)
      expect(entry.api.npm).toBe("@ai-sdk/openai-compatible")
      expect(entry.name).toBeTruthy()
      if (line === "coding") expect(listed["xsparkx2agent"].rate).toBe(2)
    }
  })
})
