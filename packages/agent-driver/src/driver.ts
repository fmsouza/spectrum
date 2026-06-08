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
