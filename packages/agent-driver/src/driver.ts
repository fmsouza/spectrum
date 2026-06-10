import type { RunnerId } from "@launchkit/agent-events"
import type { ApprovalDecision, CanonicalEvent } from "@launchkit/agent-events"
import type { HarnessId, ModelId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"

export type DriverError = {
  readonly kind:
    | "start-failed"
    | "send-failed"
    | "not-running"
    | "driver-internal"
  readonly detail: string
}

export interface AgentStartInput {
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly initialPrompt?: string
  /**
   * The harness-resolved absolute executable (e.g. the `claude` binary). A driver that spawns its
   * harness via an SDK needs this because the SDK's own bundle-relative executable resolution breaks
   * once the app is bundled (no node_modules / cli.js in the packaged binary). Sourced from the same
   * `CommandResolver` the terminal path uses, so there is one source of truth for "where is claude".
   */
  readonly command?: string
  /**
   * The harness-resolved launch args (the same the terminal path spawns with). A driver whose proxy
   * routing lives in CLI args rather than env needs these — e.g. codex routes only through a provider
   * declared via `-c model_providers.launchkit.*` overrides; without them a native codex session
   * ignores the LaunchKit proxy. Drivers that route via env (claude/opencode/openclaw) ignore this.
   */
  readonly args?: readonly string[]
}

export interface AgentSession {
  readonly rootRunnerId: RunnerId
  onEvent(cb: (e: CanonicalEvent) => void): void
  send(turn: { text: string }): Result<void, DriverError>
  respondApproval(
    requestId: string,
    decision: ApprovalDecision,
  ): Result<void, DriverError>
  interrupt(): Result<void, DriverError>
  close(): Result<void, DriverError>
}

export interface AgentDriver {
  start(input: AgentStartInput): Result<AgentSession, DriverError>
}
