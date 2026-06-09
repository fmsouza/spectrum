import type { RunnerInbound, RunnerOutbound } from "@launchkit/agent-driver"
import type { ApprovalDecision, StoredEvent } from "@launchkit/agent-events"
import type { SessionId } from "@launchkit/types"

/**
 * Transport-agnostic runner client (twin of `terminalClient`). Encodes outbound
 * runner commands to `RunnerInbound` messages (handed to the injected `send`)
 * and routes inbound `RunnerOutbound` frames to a per-session event listener.
 * Pure + testable with a fake `send`; the WebSocket coupling lives in `clients.ts`.
 */
export interface RunnerClient {
  attach(id: SessionId): void
  send(id: SessionId, text: string): void
  approve(id: SessionId, requestId: string, decision: ApprovalDecision): void
  interrupt(id: SessionId): void
  /** route an inbound RunnerOutbound frame to the registered per-session listener */
  dispatch(message: RunnerOutbound): void
  onEvent(id: SessionId, cb: (event: StoredEvent) => void): void
}

export const createRunnerClient = (
  send: (message: RunnerInbound) => void,
): RunnerClient => {
  // One conversation owns one session, so a single listener per session suffices.
  const listeners = new Map<SessionId, (event: StoredEvent) => void>()

  return {
    attach: (id) => {
      send({ type: "run-attach", id })
    },
    send: (id, text) => {
      send({ type: "run-send", id, text })
    },
    approve: (id, requestId, decision) => {
      send({ type: "run-approve", id, requestId, decision })
    },
    interrupt: (id) => {
      send({ type: "run-interrupt", id })
    },
    dispatch: (message) => {
      listeners.get(message.id)?.(message.event)
    },
    onEvent: (id, cb) => {
      listeners.set(id, cb)
    },
  }
}
