import type { RunnerInbound, RunnerOutbound } from "@spectrum/agent-driver"
import type {
  ApprovalDecision,
  PermissionMode,
  QuestionAnswer,
  StoredEvent,
} from "@spectrum/agent-events"
import type { ModelId, SessionId } from "@spectrum/types"

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
  answer(id: SessionId, requestId: string, answer: QuestionAnswer): void
  interrupt(id: SessionId): void
  setMode(id: SessionId, mode: PermissionMode): void
  setModel(id: SessionId, modelId: ModelId | null): void
  /** route an inbound RunnerOutbound frame to the registered per-session listener */
  dispatch(message: RunnerOutbound): void
  onEvent(id: SessionId, cb: (event: StoredEvent) => void): void
  /**
   * Firehose: receive EVERY dispatched frame (any session, with or without a
   * per-session listener). Returns an unsubscribe fn — required so a re-running
   * effect can drop its previous listener instead of stacking duplicates.
   */
  onAny(cb: (id: SessionId, event: StoredEvent) => void): () => void
  /** Live session-name push (session-renamed frame). Returns an unsubscribe fn. */
  onSessionRenamed(cb: (id: SessionId, name: string) => void): () => void
  /**
   * Resume-token observability frame (session-resume-token). The empty string signals
   * a fresh restart (no resumable history). Returns an unsubscribe fn.
   */
  onResumeToken(cb: (id: SessionId, resumeToken: string) => void): () => void
}

export const createRunnerClient = (
  send: (message: RunnerInbound) => void,
): RunnerClient => {
  // One conversation owns one session, so a single listener per session suffices.
  const listeners = new Map<SessionId, (event: StoredEvent) => void>()
  // Firehose listeners receive every frame (e.g. background-run notifications).
  const anyListeners = new Set<(id: SessionId, event: StoredEvent) => void>()
  const renameListeners = new Set<(id: SessionId, name: string) => void>()
  const resumeTokenListeners = new Set<
    (id: SessionId, resumeToken: string) => void
  >()

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
    answer: (id, requestId, answer) => {
      send({ type: "run-answer", id, requestId, answer })
    },
    interrupt: (id) => {
      send({ type: "run-interrupt", id })
    },
    setMode: (id, mode) => {
      send({ type: "run-set-mode", id, mode })
    },
    setModel: (id, modelId) => {
      send({ type: "run-set-model", id, modelId })
    },
    dispatch: (message) => {
      if (message.type === "session-renamed") {
        for (const cb of renameListeners) cb(message.id, message.name)
        return
      }
      if (message.type === "session-resume-token") {
        for (const cb of resumeTokenListeners)
          cb(message.id, message.resumeToken)
        return
      }
      if (message.type === "runner-event") {
        listeners.get(message.id)?.(message.event)
        for (const cb of anyListeners) cb(message.id, message.event)
      }
    },
    onEvent: (id, cb) => {
      listeners.set(id, cb)
    },
    onAny: (cb) => {
      anyListeners.add(cb)
      return () => {
        anyListeners.delete(cb)
      }
    },
    onSessionRenamed: (cb) => {
      renameListeners.add(cb)
      return () => {
        renameListeners.delete(cb)
      }
    },
    onResumeToken: (cb) => {
      resumeTokenListeners.add(cb)
      return () => {
        resumeTokenListeners.delete(cb)
      }
    },
  }
}
