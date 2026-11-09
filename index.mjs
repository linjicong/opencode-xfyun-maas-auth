// The implementation module. Only this file carries non-plugin exports
// (`_internal`, for tests); the 1.x entry re-exports the plugin functions
// alone, because OpenCode 1.x and magpie's host treat every function export
// as a plugin and refuse anything else.
import { makeFetch, makePlugin, transformBody } from "./lib/api.mjs"

export { makePlugin }

export const XfyunMaaSPlugin = makePlugin("maas")
export const XfyunCodingPlugin = makePlugin("coding")
export const XfyunTokenPlugin = makePlugin("token")

export const _internal = { transformBody, makePlugin, makeFetch }
