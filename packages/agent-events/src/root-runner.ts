import type { RunnerId, SessionId } from "@spectrum/types"
import type { CanonicalEvent } from "./events"

/**
 * A session's recorded ROOT runner — the runner from its first parentless `runner-started`.
 * Used to gate session-end side effects (notifications) so a multi-agent run notifies only when
 * the ROOT finishes, never on a sub-agent's `runner-finished`.
 */
export type RootRunnerMap = ReadonlyMap<SessionId, RunnerId>

/**
 * Record a session's root runner: the first parentless `runner-started`. PURE — returns a NEW map
 * only when it records a new root; otherwise returns the same map unchanged. Mirrors the reducer's
 * idempotence (`reduce.ts`): a child `runner-started` (has `parentRunnerId`), a second parentless
 * start for an already-known session, and every non-`runner-started` event all pass through.
 */
export const trackRootRunner = (
  roots: RootRunnerMap,
  sessionId: SessionId,
  event: CanonicalEvent,
): RootRunnerMap => {
  if (event.type !== "runner-started") return roots
  if (event.parentRunnerId !== undefined) return roots
  if (roots.has(sessionId)) return roots
  const next = new Map(roots)
  next.set(sessionId, event.runnerId)
  return next
}

/**
 * True iff this event is a `runner-finished` for the session's recorded root runner. PURE predicate.
 * Fail-closed: false when the session has no recorded root (so a finish for an untracked session is
 * never treated as a session-end).
 */
export const isRootRunnerFinished = (
  roots: RootRunnerMap,
  sessionId: SessionId,
  event: CanonicalEvent,
): boolean => {
  if (event.type !== "runner-finished") return false
  const root = roots.get(sessionId)
  if (root === undefined) return false
  return event.runnerId === root
}
