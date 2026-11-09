import { describe, expect, test } from "bun:test"
import { MODELS, ORIGINS, PROVIDER_META, toProviderModels } from "../lib/models.mjs"

const lines = ["maas", "coding", "token"]

describe("model tables", () => {
  for (const line of lines) {
    test(`${line}: ids unique, entries well-formed`, () => {
      const list = MODELS[line]
      expect(list.length).toBeGreaterThan(0)
      const ids = new Set()
      for (const m of list) {
        expect(typeof m.id).toBe("string")
        expect(m.id.length).toBeGreaterThan(0)
        expect(typeof m.name).toBe("string")
        expect(m.name.length).toBeGreaterThan(0)
        expect(Number.isInteger(m.ctx)).toBe(true)
        expect(m.ctx).toBeGreaterThan(0)
        expect(Number.isInteger(m.out)).toBe(true)
        expect(m.out).toBeGreaterThan(0)
        ids.add(m.id)
      }
      expect(ids.size).toBe(list.length)
    })
  }

  test("coding: every model carries an integer rate between 1 and 5; kimi k2.7 code is 5", () => {
    for (const m of MODELS.coding) {
      expect(Number.isInteger(m.rate)).toBe(true)
      expect(m.rate).toBeGreaterThanOrEqual(1)
      expect(m.rate).toBeLessThanOrEqual(5)
    }
    const kimi = MODELS.coding.find((m) => m.id === "xopkimi27code")
    expect(kimi?.rate).toBe(5)
  })

  test("token: offline models excluded", () => {
    const ids = new Set(MODELS.token.map((m) => m.id))
    for (const gone of ["xopdeepseekv4flash", "xopdeepseekv32", "xsparkx2agent", "xsparkx2"]) {
      expect(ids.has(gone)).toBe(false)
    }
  })

  test("maas: preview present, offline models excluded", () => {
    const ids = new Set(MODELS.maas.map((m) => m.id))
    expect(ids.has("spark-x2.6-preview")).toBe(true)
    for (const gone of [
      "xopdeepseekv4flash", // 260930下线
      "xopdeepseekv32", // 260930下线
      "xopglm47blth2", // 261009下线
      "xopkimik2blth", // 261009下线
      "xopkimik2blins", // 261009下线
      "xop3qwen30b2507", // 261009下线
      "xop3qwen235b", // 261009下线
    ]) {
      expect(ids.has(gone)).toBe(false)
    }
  })

  test("coding rate of xsparkx2agent is 2 (deduction table 5.1)", () => {
    const m = MODELS.coding.find((x) => x.id === "xsparkx2agent")
    expect(m?.rate).toBe(2)
  })

  test("reasoning flags follow the spec rules per line", () => {
    const maas = new Map(MODELS.maas.map((m) => [m.id, m.reasoning === true]))
    expect(maas.get("spark-x2.6")).toBe(true)
    expect(maas.get("spark-x2.5-1.7b")).toBe(true)
    expect(maas.get("xopglm53")).toBe(true)
    expect(maas.get("xopdeepseekv4pro")).toBe(true)
    expect(maas.get("xdeepseekr1qwen32b")).toBe(true)
    expect(maas.get("xopkimik26")).toBe(false)
    expect(maas.get("xminimaxm25")).toBe(false)

    const coding = new Map(MODELS.coding.map((m) => [m.id, m.reasoning === true]))
    expect(coding.get("xsparkx2agent")).toBe(true)
    expect(coding.get("auto")).toBe(true)
    expect(coding.get("xopglm52")).toBe(true)
    expect(coding.get("xopdeepseekv4flash")).toBe(true)
    expect(coding.get("xopkimik26")).toBe(false)

    for (const m of MODELS.token) expect(m.reasoning).toBe(true)
  })
})

describe("toProviderModels", () => {
  test("coding entry for xsparkx2agent: rate 2, 256K context, 32K output", () => {
    const out = toProviderModels(MODELS.coding)
    const m = out["xsparkx2agent"]
    expect(m).toBeDefined()
    expect(m.rate).toBe(2)
    expect(m.limit).toEqual({ context: 262144, output: 32768 })
    expect(m.tool_call).toBe(true)
    expect(m.name).toBe("Spark X2 Agent")
  })

  test("1M-context models get 65536 output, small models get 16384", () => {
    const maas = toProviderModels(MODELS.maas)
    expect(maas["spark-x2.6"].limit).toEqual({ context: 1048576, output: 65536 })
    expect(maas["spark-x2.5"].limit).toEqual({ context: 262144, output: 32768 })
    expect(maas["xop3qwen8b"].limit).toEqual({ context: 16384, output: 16384 })
  })

  test("no rate key on maas/token models, rate preserved on coding", () => {
    const maas = toProviderModels(MODELS.maas)
    const token = toProviderModels(MODELS.token)
    for (const m of Object.values(maas)) expect("rate" in m).toBe(false)
    for (const m of Object.values(token)) expect("rate" in m).toBe(false)
    expect(toProviderModels(MODELS.coding)["auto"].rate).toBe(2)
  })
})

describe("provider metadata", () => {
  test("ids, names and labels match the global constraints", () => {
    expect(PROVIDER_META.maas).toMatchObject({
      id: "xfyun-maas",
      name: "讯飞星辰 MaaS",
      label: "MaaS API Key",
    })
    expect(PROVIDER_META.coding).toMatchObject({
      id: "xfyun-coding",
      name: "讯飞 Coding Plan",
      label: "Coding Plan API Key",
      maxConcurrency: 4,
    })
    expect(PROVIDER_META.token).toMatchObject({
      id: "xfyun-token",
      name: "讯飞 Token Plan",
      label: "Token Plan API Key",
    })
  })

  test("origins for the three product lines", () => {
    expect(ORIGINS.maas).toBe("https://maas-api.cn-huabei-1.xf-yun.com")
    expect(ORIGINS.coding).toBe("https://maas-coding-api.cn-huabei-1.xf-yun.com")
    expect(ORIGINS.token).toBe("https://maas-token-api.cn-huabei-1.xf-yun.com")
  })
})
