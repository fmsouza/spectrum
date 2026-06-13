import type { CanonicalEvent, RunnerId, Usage } from "@spectrum/agent-events"
import type { OpenClawEvent } from "./transport"

/** Mutable mapping state: session→runner correlation + buffered usage. Owned by the adapter per run. */
export interface OpenclawMapState {
  readonly rootRunnerId: RunnerId
  readonly newRunnerId: () => RunnerId
  /** Gateway sessionKey → canonical RunnerId. The root session maps to rootRunnerId on its run.started. */
  readonly sessions: Map<string, RunnerId>
  /** Latest usage seen for the root run, emitted again on completion (cumulative snapshot). */
  usage: Usage | undefined
  /** Whether the root run.started has been observed (root session bound). */
  rootBound: boolean
}

export const newOpenclawMapState = (deps: {
  readonly rootRunnerId: RunnerId
  readonly newRunnerId: () => RunnerId
}): OpenclawMapState => ({
  rootRunnerId: deps.rootRunnerId,
  newRunnerId: deps.newRunnerId,
  sessions: new Map<string, RunnerId>(),
  usage: undefined,
  rootBound: false,
})

/** Resolve the RunnerId for a sessionKey, or undefined if that session has not been announced yet. */
const runnerFor = (
  state: OpenclawMapState,
  sessionKey: string,
): RunnerId | undefined => state.sessions.get(sessionKey)

/**
 * Map ONE normalized OpenClaw event to 0..n canonical events, mutating correlation/usage state.
 * Pure w.r.t. IO; deterministic given the same state. Unknown sessions on non-run.started events
 * are ignored (defensive — matches the reducer's "unknown runnerId" rule).
 */
export const mapOpenclawEvent = (
  event: OpenClawEvent,
  state: OpenclawMapState,
): readonly CanonicalEvent[] => {
  switch (event.event) {
    case "run.started": {
      const p = event.payload
      const isChild =
        p.childSessionKey !== undefined || p.parentSessionKey !== undefined
      if (!isChild && !state.rootBound) {
        state.sessions.set(p.sessionKey, state.rootRunnerId)
        state.rootBound = true
        return [
          {
            type: "runner-started",
            runnerId: state.rootRunnerId,
            ...(p.model !== undefined ? { model: p.model } : {}),
          },
        ]
      }
      // Sub-agent run: mint a child id, correlate, and announce under its parent.
      const child = state.newRunnerId()
      state.sessions.set(p.sessionKey, child)
      const parentRunnerId =
        (p.parentSessionKey !== undefined
          ? runnerFor(state, p.parentSessionKey)
          : undefined) ?? state.rootRunnerId
      return [
        {
          type: "runner-started",
          runnerId: child,
          parentRunnerId,
          ...(p.spawnedByCallId !== undefined
            ? { spawnedByCallId: p.spawnedByCallId }
            : {}),
          ...(p.agentId !== undefined ? { agentType: p.agentId } : {}),
        },
      ]
    }
    case "assistant.delta": {
      const runner = runnerFor(state, event.payload.sessionKey)
      if (runner === undefined) return []
      const text = event.payload.deltaText ?? event.payload.message ?? ""
      if (text === "") return []
      return [
        {
          type: "text-delta",
          runnerId: runner,
          messageId: event.payload.messageId ?? "msg",
          text,
        },
      ]
    }
    case "assistant.message": {
      // Cumulative snapshot only (no delta): the reducer accumulates, so a trailing non-delta snapshot
      // would double-append. Treat a snapshot-only message as a no-op unless it is the sole text signal.
      return []
    }
    case "tool.call.started": {
      const runner = runnerFor(state, event.payload.sessionKey)
      if (runner === undefined) return []
      return [
        {
          type: "tool-call-started",
          runnerId: runner,
          callId: event.payload.callId,
          tool: event.payload.tool,
          ...(event.payload.input !== undefined
            ? { input: event.payload.input }
            : {}),
        },
      ]
    }
    case "tool.call.delta": {
      const runner = runnerFor(state, event.payload.sessionKey)
      if (runner === undefined) return []
      return [
        {
          type: "tool-output-delta",
          runnerId: runner,
          callId: event.payload.callId,
          chunk: event.payload.chunk,
        },
      ]
    }
    case "tool.call.completed": {
      const runner = runnerFor(state, event.payload.sessionKey)
      if (runner === undefined) return []
      const status: "ok" | "error" = event.payload.status ?? "ok"
      return [
        {
          type: "tool-call-finished",
          runnerId: runner,
          callId: event.payload.callId,
          status,
          ...(event.payload.output !== undefined
            ? { output: event.payload.output }
            : {}),
          ...(event.payload.exitCode !== undefined
            ? { exitCode: event.payload.exitCode }
            : {}),
          ...(event.payload.result !== undefined
            ? { result: event.payload.result }
            : {}),
        },
      ]
    }
    case "exec.approval.requested": {
      const runner =
        runnerFor(state, event.payload.sessionKey) ?? state.rootRunnerId
      return [
        {
          type: "approval-requested",
          runnerId: runner,
          requestId: event.payload.approvalId,
          target: {
            kind: event.payload.kind ?? "command",
            detail: event.payload.detail,
          },
        },
      ]
    }
    case "exec.approval.resolved": {
      // The canonical approval-resolved is emitted by the runtime on respondApproval; the gateway's
      // own resolved echo is informational. No canonical event (avoid a duplicate).
      return []
    }
    case "usage": {
      const runner =
        runnerFor(state, event.payload.sessionKey) ?? state.rootRunnerId
      const usage: Usage = {
        inputTokens: event.payload.inputTokens,
        outputTokens: event.payload.outputTokens,
        ...(event.payload.cachedInputTokens !== undefined
          ? { cachedInputTokens: event.payload.cachedInputTokens }
          : {}),
        ...(event.payload.costUsd !== undefined
          ? { costUsd: event.payload.costUsd }
          : {}),
      }
      if (runner === state.rootRunnerId) state.usage = usage
      return [{ type: "usage", runnerId: runner, usage }]
    }
    case "run.completed": {
      // A run is a TURN, not the session — the Gateway stays connected for follow-up turns. Emit
      // `turn-finished` so the runner keeps running + the composer stays enabled. Session-fatal errors
      // arrive via the separate `error` event (below) and still end the runner.
      const runner =
        runnerFor(state, event.payload.sessionKey) ?? state.rootRunnerId
      return [{ type: "turn-finished", runnerId: runner }]
    }
    case "run.failed": {
      // A failed turn ends the turn (not the session); surface the error as assistant text.
      const runner =
        runnerFor(state, event.payload.sessionKey) ?? state.rootRunnerId
      const events: CanonicalEvent[] = []
      if (event.payload.error !== undefined)
        events.push({
          type: "text-delta",
          runnerId: runner,
          messageId: `run-error-${event.payload.sessionKey}`,
          text: `⚠️ ${event.payload.error}`,
        })
      events.push({ type: "turn-finished", runnerId: runner })
      return events
    }
    case "error": {
      const runner =
        (event.payload.sessionKey !== undefined
          ? runnerFor(state, event.payload.sessionKey)
          : undefined) ?? state.rootRunnerId
      return [
        {
          type: "runner-finished",
          runnerId: runner,
          status: "errored",
          error: event.payload.error,
        },
      ]
    }
  }
}
