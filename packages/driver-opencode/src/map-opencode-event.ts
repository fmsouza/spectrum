import type { CanonicalEvent, RunnerId } from "@spectrum/agent-events"
import type { OpencodeEvent } from "./transport"

/** Mutable mapping state: session→runner correlation + per-call lifecycle tracking. Owned by the adapter per run. */
export interface OpencodeMapState {
  readonly rootRunnerId: RunnerId
  readonly newRunnerId: () => RunnerId
  /** OpenCode sessionID → canonical RunnerId. The root session id maps to rootRunnerId. */
  readonly sessions: Map<string, RunnerId>
  /** callIDs already announced via tool-call-started (so a re-emitted part doesn't double-start). */
  readonly startedCalls: Set<string>
}

export const newOpencodeMapState = (deps: {
  readonly rootRunnerId: RunnerId
  readonly rootSessionId: string
  readonly newRunnerId: () => RunnerId
}): OpencodeMapState => ({
  rootRunnerId: deps.rootRunnerId,
  newRunnerId: deps.newRunnerId,
  sessions: new Map<string, RunnerId>([
    [deps.rootSessionId, deps.rootRunnerId],
  ]),
  startedCalls: new Set<string>(),
})

const runnerFor = (
  state: OpencodeMapState,
  sessionID: string,
): RunnerId | undefined => state.sessions.get(sessionID)

/** Pull a human message out of OpenCode's `{ name, data: { message } }` error envelope, defensively. */
const extractErrorMessage = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined
  const data = (error as { data?: unknown }).data
  if (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { message?: unknown }).message === "string"
  ) {
    return (data as { message: string }).message
  }
  const name = (error as { name?: unknown }).name
  return typeof name === "string" ? name : undefined
}

/**
 * Map ONE OpenCode SSE event to 0..n canonical events, mutating correlation/lifecycle state.
 * Pure w.r.t. IO; deterministic given the same state. Events whose sessionID is not a known runner
 * (and are not a child-session announcement) return [] — this IS the client-side sessionID filter
 * the global bus requires.
 */
export const mapOpencodeEvent = (
  event: OpencodeEvent,
  state: OpencodeMapState,
): readonly CanonicalEvent[] => {
  switch (event.type) {
    case "session.created":
    case "session.updated": {
      const info = event.properties.info
      // A NEW child session (parentID set, not yet correlated) announces a sub-runner.
      if (info.parentID !== undefined && !state.sessions.has(info.id)) {
        const parent = runnerFor(state, info.parentID)
        if (parent === undefined) return [] // parent unknown -> out of scope
        const child = state.newRunnerId()
        state.sessions.set(info.id, child)
        return [
          {
            type: "runner-started",
            runnerId: child,
            parentRunnerId: parent,
            ...(info.title !== undefined ? { title: info.title } : {}),
          },
        ]
      }
      // The ROOT session (already correlated to rootRunnerId) carrying a title: re-emit a
      // root runner-started with that title so the RunManager can name the session. The reducer
      // treats runner-started idempotently (preserves items/title), so this is a safe refinement.
      // Only emit when a title is actually present (avoid a no-op re-emit).
      if (
        info.title !== undefined &&
        state.sessions.get(info.id) === state.rootRunnerId
      ) {
        return [
          {
            type: "runner-started",
            runnerId: state.rootRunnerId,
            title: info.title,
          },
        ]
      }
      return []
    }
    case "message.part.updated": {
      const part = event.properties.part
      const runner = runnerFor(state, part.sessionID)
      if (runner === undefined) return []
      if (part.type === "text") {
        if (part.text === "") return []
        return [
          {
            type: "text-delta",
            runnerId: runner,
            messageId: part.messageID,
            text: part.text,
          },
        ]
      }
      if (part.type === "tool") {
        const out: CanonicalEvent[] = []
        if (!state.startedCalls.has(part.callID)) {
          state.startedCalls.add(part.callID)
          out.push({
            type: "tool-call-started",
            runnerId: runner,
            callId: part.callID,
            tool: part.tool,
            ...(part.state.input !== undefined
              ? { input: part.state.input }
              : {}),
          })
        }
        if (part.state.status === "completed") {
          out.push({
            type: "tool-call-finished",
            runnerId: runner,
            callId: part.callID,
            status: "ok",
            output: part.state.output,
          })
        } else if (part.state.status === "error") {
          out.push({
            type: "tool-call-finished",
            runnerId: runner,
            callId: part.callID,
            status: "error",
            output: part.state.error,
          })
        }
        return out
      }
      // reasoning/file/agent/step-* — not surfaced in Spec; ignore.
      return []
    }
    case "permission.updated": {
      // Deliberately emits NO canonical events. The runtime approval bridge
      // (ctx.requestApproval in driver-runtime) is the single source of truth for
      // approval-requested — it mints the apr_* requestId that approval-resolved matches.
      // Emitting here would produce a duplicate dangling card in the UI.
      return []
    }
    case "permission.replied": {
      // The canonical approval-resolved is emitted by the runtime on respondApproval; the server's
      // own reply echo is informational. No canonical event (avoid a duplicate).
      return []
    }
    case "session.idle": {
      const runner = runnerFor(state, event.properties.sessionID)
      if (runner === undefined) return []
      return [{ type: "turn-finished", runnerId: runner }]
    }
    case "session.error": {
      const info = event.properties.info
      const runner =
        info === undefined
          ? state.rootRunnerId
          : (runnerFor(state, info.id) ?? state.rootRunnerId)
      const error = extractErrorMessage(event.properties.error)
      return [
        {
          type: "runner-finished",
          runnerId: runner,
          status: "errored",
          ...(error !== undefined ? { error } : {}),
        },
      ]
    }
    default:
      // message.updated, session.deleted, and any non-child session.* fall through to [].
      return []
  }
}
