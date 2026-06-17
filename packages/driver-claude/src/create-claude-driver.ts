import type { AgentDriver } from "@spectrum/agent-driver"
import { createDriver } from "@spectrum/driver-runtime"
import type { Logger } from "@spectrum/logger"
import type { IdGen } from "@spectrum/utils"
import { createClaudeAdapter } from "./sdk-glue"
import type { ClaudeSdk } from "./sdk-glue"

/** Lazily load the real SDK (kept out of the cold path; the glue only needs `query`). */
const defaultLoadSdk = async (): Promise<ClaudeSdk> => {
  const mod = await import("@anthropic-ai/claude-agent-sdk")
  return { query: mod.query as ClaudeSdk["query"] }
}

/**
 * The Claude Code `AgentDriver`. Wraps `createClaudeAdapter` in the shared runtime. `loadSdk`,
 * `baseEnv`, and `scheduler` are injectable for tests; production uses the real lazy SDK import,
 * the process environment, and queueMicrotask. `baseEnv` is the parent env merged under the per-run
 * proxy env so the spawned `claude` inherits `PATH`/`HOME` (see `createClaudeAdapter`).
 */
export const createClaudeDriver = (deps: {
  readonly idGen: IdGen
  readonly loadSdk?: () => Promise<ClaudeSdk>
  readonly pathToClaudeExecutable?: string
  readonly baseEnv?: () => Record<string, string | undefined>
  readonly scheduler?: (fn: () => void) => void
  readonly logger?: Logger
}): AgentDriver =>
  createDriver({
    adapter: createClaudeAdapter({
      loadSdk: deps.loadSdk ?? defaultLoadSdk,
      baseEnv: deps.baseEnv ?? (() => process.env),
      ...(deps.pathToClaudeExecutable !== undefined
        ? { pathToClaudeExecutable: deps.pathToClaudeExecutable }
        : {}),
      ...(deps.logger !== undefined ? { logger: deps.logger } : {}),
    }),
    idGen: deps.idGen,
    ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
  })
