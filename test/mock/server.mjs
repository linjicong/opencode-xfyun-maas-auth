// A minimal stand-in for the Xfyun MaaS gateway, for integration tests.
//   node test/mock/server.mjs [port]
// Endpoints (all under any host; we only look at the path):
//   POST /v2/chat/completions
//     - `stream:true`  -> SSE: two data chunks flushed separately, then [DONE]
//     - otherwise      -> a chat.completion JSON body
//     - `?status=401`  -> 401 with the gateway's error body
//     - `?status=429`  -> 429 with an error-code body
// Records every request's headers and body to GET /last-request.
import { createServer } from "node:http"

const port = Number(process.argv[2] ?? 0)

let last = { headers: {}, body: "" }

const chatBody = JSON.stringify({
  id: "chat-1",
  object: "chat.completion",
  model_id: "spark-x2.6",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "你好！" } }],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
})

const errorBody = JSON.stringify({ code: 11201, message: "当日使用量达到上限" })
const unauthorizedBody = JSON.stringify({ error: { code: 401, message: "HMAC signature cannot be verified: apikey not found" } })

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock.local")

  if (req.method === "GET" && url.pathname === "/last-request") {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify(last))
    return
  }

  if (req.method === "POST" && url.pathname === "/v2/chat/completions") {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString("utf8")
    last = { headers: req.headers, body }

    const status = Number(url.searchParams.get("status") ?? 0)
    if (status === 401 || status === 429) {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(status === 401 ? unauthorizedBody : errorBody)
      return
    }

    if (body.includes('"stream":true') || body.includes('"stream": true')) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      res.write('data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n')
      await new Promise((r) => setTimeout(r, 50))
      res.write('data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"}}]}\n\n')
      await new Promise((r) => setTimeout(r, 50))
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    res.writeHead(200, { "content-type": "application/json" })
    res.end(chatBody)
    return
  }

  res.writeHead(404, { "content-type": "application/json" })
  res.end(JSON.stringify({ code: 404, message: `no such path ${url.pathname}` }))
})

export function start(listenPort = 0) {
  return new Promise((resolve) => {
    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address()
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` })
    })
  })
}

if (import.meta.main) {
  start(port).then(({ url }) => console.log(`mock listening on ${url}`))
}

export default server
