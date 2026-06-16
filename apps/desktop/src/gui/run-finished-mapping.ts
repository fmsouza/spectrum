import type { RunnerOutbound } from "@spectrum/agent-driver"
import type { RunFinished } from "./notification-service"

/**
 * Resolve a session's harness + cwd for a finished-run notification. Injected in composition
 * (backed by the session store); returns `undefined` if the session can't be resolved, in which
 * case the harnessId falls back to the empty string and cwd is omitted.
 */
export type SessionInfoResolver = (
  sessionId: string,
) => { readonly harnessId: string; readonly cwd?: string } | undefined

/**
 * Pure map: a `RunnerOutbound` frame → the `RunFinished` payload the notifier wants, or `null` if
 * the frame is not a terminal run-finished worth notifying about. Only `completed`/`errored` map;
 * `interrupted` (and every non-`runner-finished` event) returns `null` so the notifier is skipped.
 * The harnessId/cwd are looked up via the injected resolver (the frame carries only the sessionId).
 */
export const mapRunFinished = (
  frame: RunnerOutbound,
  resolve: SessionInfoResolver,
): RunFinished | null => {
  if (frame.type !== "runner-event") return null
  const inner = frame.event.event
  if (inner.type !== "runner-finished") return null
  if (inner.status !== "completed" && inner.status !== "errored") return null

  const sessionId = String(frame.id)
  const info = resolve(sessionId)
  const harnessId = info?.harnessId ?? ""
  const cwd = info?.cwd
  return {
    sessionId,
    harnessId,
    status: inner.status,
    ...(cwd !== undefined && cwd !== "" ? { cwd } : {}),
  }
}
