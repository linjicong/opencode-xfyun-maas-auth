// Loads the package the way magpie's plugin host and OpenCode 1.x do and
// checks the shape of every plugin it exports. Signs in to nothing and
// sends no request. Mirrors the assertions of
// magpie-community/plugins scripts/check.mjs for a provider plugin.
//
//   bun scripts/check.mjs   -> exit 0 (all good) or 1 (problems listed)
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const repo = resolve(import.meta.dir, "..")
let failed = 0
const problems = []

const mod = await import(pathToFileURL(resolve(repo, "opencode.mjs")).href)

const entries = Object.entries(mod)
const fns = entries.filter(([, v]) => typeof v === "function")
if (!fns.length) problems.push("opencode.mjs exports no plugin function")
for (const [name, value] of entries) {
  if (typeof value !== "function") problems.push(`opencode.mjs exports ${name}, which OpenCode 1.x takes for a plugin and refuses`)
}

const expected = new Set(["XfyunMaaSPlugin", "XfyunCodingPlugin", "XfyunTokenPlugin"])
const actual = new Set(fns.map(([n]) => n))
for (const name of expected) if (!actual.has(name)) problems.push(`opencode.mjs does not export ${name}`)
for (const name of actual) if (!expected.has(name)) problems.push(`opencode.mjs exports unexpected function ${name}`)

const client = {
  app: { log: async () => ({ data: true }) },
  auth: { set: async () => ({ data: true }), remove: async () => ({ data: true }) },
  tui: { showToast: async () => ({ data: true }) },
  config: { get: async () => ({ data: {} }) },
}

for (const [name, fn] of fns) {
  const hooks = await fn({ client, directory: repo, worktree: repo, project: {} })

  const auth = hooks?.auth
  if (!auth) problems.push(`${name}: no auth hook`)
  else {
    if (typeof auth.provider !== "string" || !auth.provider) problems.push(`${name}: auth.provider is not a provider id`)
    if (!Array.isArray(auth.methods) || !auth.methods.length) problems.push(`${name}: auth.methods is empty`)
    for (const m of auth.methods ?? []) {
      if (m?.type !== "api") problems.push(`${name}: method type ${m?.type}`)
      if (!m?.label) problems.push(`${name}: method has no label`)
    }
    if (typeof auth.loader !== "function") problems.push(`${name}: auth.loader is not a function`)
  }

  if (typeof hooks.config !== "function") problems.push(`${name}: no config hook`)
  else {
    const cfg = { provider: {} }
    await hooks.config(cfg)
    const p = cfg.provider[auth?.provider]
    if (!p) problems.push(`${name}: config does not fill provider ${auth?.provider}`)
    else {
      if (p.npm !== "@ai-sdk/openai-compatible") problems.push(`${name}: provider npm is ${p.npm}`)
      if (!p.api || !/\/v2$/.test(p.api)) problems.push(`${name}: provider api is ${p.api}`)
      const count = Object.keys(p.models ?? {}).length
      if (!count) problems.push(`${name}: config provider has no models`)
      else console.log(`  ${name}: ${auth.provider} -> ${count} models, api ${p.api}`)
    }
  }

  const provider = hooks?.provider
  if (provider?.id !== auth?.provider) problems.push(`${name}: provider.id (${provider?.id}) does not match auth.provider (${auth?.provider})`)
  if (typeof provider?.models !== "function") problems.push(`${name}: provider.models is not a function`)
  else {
    const cfg = { provider: {} }
    await hooks.config(cfg)
    const listed = await provider.models(cfg.provider[auth.provider])
    const count = Object.keys(listed ?? {}).length
    if (!count) problems.push(`${name}: provider.models returned no models`)
  }
}

// the coding plan caps concurrency per magpie's auth.maxConcurrency
{
  const hooks = await mod.XfyunCodingPlugin({ client, directory: repo, worktree: repo, project: {} })
  if (hooks?.auth?.maxConcurrency !== 4) problems.push("XfyunCodingPlugin: auth.maxConcurrency is not 4")
  const hooks2 = await mod.XfyunMaaSPlugin({ client, directory: repo, worktree: repo, project: {} })
  if (hooks2?.auth?.maxConcurrency !== undefined) problems.push("XfyunMaaSPlugin: unexpected auth.maxConcurrency")
}

// _internal lives on index.mjs, never on the 1.x entry
const internal = await import(pathToFileURL(resolve(repo, "index.mjs")).href)
for (const k of ["transformBody", "makePlugin", "makeFetch"]) {
  if (typeof internal._internal?.[k] !== "function") problems.push(`index.mjs _internal.${k} is missing`)
}

// opencode2.mjs must be byte-identical to the community adapter
{
  const { createHash } = await import("node:crypto")
  const { readFileSync } = await import("node:fs")
  const local = readFileSync(resolve(repo, "opencode2.mjs"))
  let upstream = null
  for (let attempt = 1; attempt <= 3 && upstream === null; attempt++) {
    try {
      const r = await fetch("https://raw.githubusercontent.com/magpie-community/plugins/main/scripts/opencode2.mjs")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      upstream = Buffer.from(await r.arrayBuffer())
    } catch (e) {
      if (attempt === 3) console.log(`  (skipped upstream opencode2.mjs comparison: ${e.message})`)
      else await new Promise((r2) => setTimeout(r2, 500 * attempt))
    }
  }
  if (upstream !== null) {
    const a = createHash("sha256").update(local).digest("hex")
    const b = createHash("sha256").update(upstream).digest("hex")
    if (a !== b) problems.push("opencode2.mjs differs from magpie-community/plugins scripts/opencode2.mjs: copy it again")
  }
}

if (problems.length) {
  failed = 1
  console.log(`✗ opencode-xfyun-maas-auth\n  ${problems.join("\n  ")}`)
} else {
  console.log("✓ opencode-xfyun-maas-auth")
}
process.exit(failed)
