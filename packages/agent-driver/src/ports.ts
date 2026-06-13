import type { CanonicalEvent, StoredEvent } from "@spectrum/agent-events"
import type { HarnessId, ModelId, Session, SessionId } from "@spectrum/types"
import type { Result } from "@spectrum/utils"

/** Subset of SessionStore the RunManager needs (defined locally to avoid a sessions dependency). */
export interface SessionSink {
  create(input: {
    harnessId: HarnessId
    modelId?: ModelId
    name?: string
    cwd?: string
  }): Result<Session, { kind: string; detail?: string }>
  close(
    id: SessionId,
    exitCode: number,
  ): Result<Session, { kind: string; detail?: string }>
}

/** Subset of RunStore the RunManager needs (defined locally to avoid a run-store dependency). */
export interface RunEventSink {
  append(
    sessionId: SessionId,
    event: CanonicalEvent,
  ): Result<{ seq: number }, { detail: string }>
  read(sessionId: SessionId): Result<readonly StoredEvent[], { detail: string }>
}
