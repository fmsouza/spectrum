import type { AgentDriver } from "@launchkit/agent-driver"
import { createDriver } from "@launchkit/driver-runtime"
import type { IdGen } from "@launchkit/utils"
import { createClaudeAdapter } from "./sdk-glue"
import type { ClaudeSdk } from "./sdk-glue"

/** Lazily load the real SDK (kept out of the cold path; the glue only needs `query`). */
const defaultLoadSdk = async (): Promise<ClaudeSdk> => {
  const mod = await import("@anthropic-ai/claude-agent-sdk")
  return { query: mod.query as ClaudeSdk["query"] }
}

/**
 * The Claude Code `AgentDriver`. Wraps `createClaudeAdapter` in the shared runtime. `loadSdk` +
 * `scheduler` are injectable for tests; production uses the real lazy SDK import + queueMicrotask.
 */
export const createClaudeDriver = (deps: {
  readonly idGen: IdGen
  readonly loadSdk?: () => Promise<ClaudeSdk>
  readonly pathToClaudeExecutable?: string
  readonly scheduler?: (fn: () => void) => void
}): AgentDriver =>
  createDriver({
    adapter: createClaudeAdapter({
      loadSdk: deps.loadSdk ?? defaultLoadSdk,
      ...(deps.pathToClaudeExecutable !== undefined
        ? { pathToClaudeExecutable: deps.pathToClaudeExecutable }
        : {}),
    }),
    idGen: deps.idGen,
    ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
  })
