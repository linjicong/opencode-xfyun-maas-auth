import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makePlugin } from "../lib/api.mjs"
import { start } from "./mock/server.mjs"

let mock
let loaderFetch

beforeAll(async () => {
  mock = await start(0)
  const hooks = await makePlugin("maas")({ client: {}, directory: ".", worktree: ".", project: {} })
  const loader = await hooks.auth.loader(async () => ({ type: "api", key: "ak-test-key" }))
  loaderFetch = loader.fetch
})

afterAll(async () => {
  await new Promise((r) => mock.server.close(r))
})

const post = (path, body) => loaderFetch(`${mock.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body })

async function lastRequest() {
  const res = await fetch(`${mock.url}/last-request`)
  return res.json()
}

describe("signed fetch against the gateway", () => {
  test("sends the account key as a Bearer token", async () => {
    const res = await post("/v2/chat/completions", JSON.stringify({ model: "spark-x2.6", messages: [{ role: "user", content: "hi" }] }))
    expect(res.status).toBe(200)
    const seen = await lastRequest()
    expect(seen.headers.authorization).toBe("Bearer ak-test-key")
  })

  test("rewrites max_tokens for spark models on the wire", async () => {
    await post("/v2/chat/completions", JSON.stringify({ model: "spark-x2.6", messages: [], max_tokens: 8 }))
    const seen = await lastRequest()
    const sent = JSON.parse(seen.body)
    expect(sent.max_completion_tokens).toBe(8)
    expect("max_tokens" in sent).toBe(false)
  })

  test("streams SSE chunks through unbuffered, in order, ending with [DONE]", async () => {
    const res = await post("/v2/chat/completions", JSON.stringify({ model: "spark-x2.6", messages: [], stream: true }))
    expect(res.status).toBe(200)
    const reads = []
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      reads.push(new TextDecoder().decode(value))
    }
    expect(reads.length).toBeGreaterThanOrEqual(2)
    const first = reads[0]
    expect(first).toContain('"role":"assistant"')
    expect(first).not.toContain('"content":"你好"') // the second delta did not ride along in the first flush
    const all = reads.join("")
    expect(all.indexOf('"role":"assistant"')).toBeLessThan(all.indexOf('"content":"你好"'))
    expect(all).toContain("data: [DONE]")
  })

  test("401 gains X-Magpie-Sign-In: expired with the body byte-identical", async () => {
    const expected = await fetch(`${mock.url}/v2/chat/completions?status=401`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((r) => r.text())

    const res = await post("/v2/chat/completions?status=401", JSON.stringify({ model: "spark-x2.6", messages: [] }))
    expect(res.status).toBe(401)
    expect(res.headers.get("x-magpie-sign-in")).toBe("expired")
    expect(await res.text()).toBe(expected)
  })

  test("429 passes through untouched with no sign-in header", async () => {
    const res = await post("/v2/chat/completions?status=429", JSON.stringify({ model: "spark-x2.6", messages: [] }))
    expect(res.status).toBe(429)
    expect(res.headers.get("x-magpie-sign-in")).toBeNull()
    const body = JSON.parse(await res.text())
    expect(body.code).toBe(11201)
  })
})
