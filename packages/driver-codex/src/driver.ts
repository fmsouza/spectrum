import type { AgentDriver } from "@spectrum/agent-driver"
import { createDriver } from "@spectrum/driver-runtime"
import type { SessionId } from "@spectrum/types"
import type { IdGen } from "@spectrum/utils"
import { type CreateCodexAdapterDeps, createCodexAdapter } from "./adapter"

export interface CreateCodexDriverDeps {
  readonly idGen: IdGen
  /** Optional synchronous scheduler for tests (defaults to the runtime's queueMicrotask). */
  readonly scheduler?: (fn: () => void) => void
  /** Optional spawn override for tests; production uses the real stdio transport. */
  readonly spawn?: CreateCodexAdapterDeps["spawn"]
  /** Optional fake-transport factory for tests; production builds the real stdio transport. */
  readonly createTransport?: CreateCodexAdapterDeps["createTransport"]
  /** The resolved `codex` executable (threaded from the harness resolver). */
  readonly command?: string
  /** Parent env merged UNDER the per-run proxy env (default `process.env`). */
  readonly baseEnv?: CreateCodexAdapterDeps["baseEnv"]
  /**
   * Persist the harness-native session id (Codex's `threadId`) once the adapter learns it.
   * Forwarded to the runtime's `createDriver`; the runtime binds it to the current Spectrum
   * `sessionId` automatically (adapters call `ctx.reportResumeToken`).
   */
  readonly setResumeId?: (sessionId: SessionId, resumeId: string) => void
}

/** The Codex AgentDriver: a thin app-server adapter wrapped by the shared runtime. Mirrors createClaudeDriver. */
export const createCodexDriver = (deps: CreateCodexDriverDeps): AgentDriver =>
  createDriver({
    idGen: deps.idGen,
    ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
    ...(deps.setResumeId !== undefined
      ? { setResumeId: deps.setResumeId }
      : {}),
    adapter: createCodexAdapter({
      idGen: deps.idGen,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
      ...(deps.createTransport
        ? { createTransport: deps.createTransport }
        : {}),
      ...(deps.command ? { command: deps.command } : {}),
      ...(deps.baseEnv ? { baseEnv: deps.baseEnv } : {}),
    }),
  })
