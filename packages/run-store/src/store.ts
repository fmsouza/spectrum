import type { CanonicalEvent, StoredEvent } from "@launchkit/agent-events"
import { type DbClient, runEvents, tryDb } from "@launchkit/db"
import type { SessionId } from "@launchkit/types"
import { type Clock, type Result, err, isErr, ok } from "@launchkit/utils"
import { asc, eq, max } from "drizzle-orm"
import type { RunStoreError } from "./errors"

export type { RunStoreError } from "./errors"

export interface RunStore {
  append(
    sessionId: SessionId,
    event: CanonicalEvent,
  ): Result<{ seq: number }, RunStoreError>
  read(sessionId: SessionId): Result<readonly StoredEvent[], RunStoreError>
}

type RunEventRow = typeof runEvents.$inferSelect

/** Convert a DbError boundary failure into the store's RunStoreError. */
const asRunStoreError = <T>(
  r: Result<T, { readonly detail: string }>,
): Result<T, RunStoreError> =>
  isErr(r) ? err({ kind: "db-failed", detail: r.error.detail }) : r

/** Map a drizzle row into a StoredEvent, parsing the JSON payload back to the domain event. */
const toStoredEvent = (row: RunEventRow): StoredEvent => ({
  seq: row.seq,
  sessionId: row.sessionId as SessionId,
  ts: row.ts,
  event: JSON.parse(row.payload) as CanonicalEvent,
})

export const createRunStore = (deps: {
  readonly db: DbClient
  readonly clock: Clock
}): RunStore => {
  const { handle } = deps.db

  return {
    append: (
      sessionId: SessionId,
      event: CanonicalEvent,
    ): Result<{ seq: number }, RunStoreError> => {
      const maxRow = asRunStoreError(
        tryDb(() =>
          handle
            .select({ value: max(runEvents.seq) })
            .from(runEvents)
            .where(eq(runEvents.sessionId, sessionId))
            .get(),
        ),
      )
      if (isErr(maxRow)) return maxRow
      const seq = (maxRow.value?.value ?? -1) + 1
      const ts = deps.clock.now().toISOString()
      const written = asRunStoreError(
        tryDb(() =>
          handle
            .insert(runEvents)
            .values({
              sessionId,
              seq,
              runnerId: event.runnerId,
              type: event.type,
              payload: JSON.stringify(event),
              ts,
            })
            .run(),
        ),
      )
      if (isErr(written)) return written
      return ok({ seq })
    },

    read: (
      sessionId: SessionId,
    ): Result<readonly StoredEvent[], RunStoreError> => {
      const rows = asRunStoreError(
        tryDb(() =>
          handle
            .select()
            .from(runEvents)
            .where(eq(runEvents.sessionId, sessionId))
            .orderBy(asc(runEvents.seq))
            .all(),
        ),
      )
      if (isErr(rows)) return rows
      return ok(rows.value.map(toStoredEvent))
    },
  }
}
