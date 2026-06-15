import {
  type DbClient,
  projects,
  runEvents,
  sessions,
  tryDb,
} from "@spectrum/db"
import type { ProjectId, SessionId } from "@spectrum/types"
import { type Result, err, isErr } from "@spectrum/utils"
import { eq, inArray } from "drizzle-orm"
import type { DataAdminError } from "./errors"

export type { DataAdminError } from "./errors"

export interface DataAdmin {
  /** Delete a session's run_events, then the session row — in one transaction. */
  deleteSession(id: SessionId): Result<void, DataAdminError>

  /**
   * Delete a project: every run_events row for its sessions, then those sessions,
   * then the project row — in one transaction.
   */
  deleteProject(id: ProjectId): Result<void, DataAdminError>
}

/** Convert a DbError boundary failure into the package's DataAdminError. */
const asDataAdminError = <T>(
  r: Result<T, { readonly detail: string }>,
): Result<T, DataAdminError> =>
  isErr(r) ? err({ kind: "db-failed", detail: r.error.detail }) : r

export const createDataAdmin = (deps: { readonly db: DbClient }): DataAdmin => {
  const { handle } = deps.db

  return {
    deleteSession: (id: SessionId): Result<void, DataAdminError> =>
      asDataAdminError(
        tryDb(() =>
          handle.transaction((tx) => {
            tx.delete(runEvents).where(eq(runEvents.sessionId, id)).run()
            tx.delete(sessions).where(eq(sessions.id, id)).run()
          }),
        ),
      ),

    deleteProject: (id: ProjectId): Result<void, DataAdminError> =>
      asDataAdminError(
        tryDb(() =>
          handle.transaction((tx) => {
            const rows = tx
              .select({ id: sessions.id })
              .from(sessions)
              .where(eq(sessions.projectId, id))
              .all()
            const sessionIds = rows.map((r) => r.id)
            if (sessionIds.length > 0)
              tx.delete(runEvents)
                .where(inArray(runEvents.sessionId, sessionIds))
                .run()
            tx.delete(sessions).where(eq(sessions.projectId, id)).run()
            tx.delete(projects).where(eq(projects.id, id)).run()
          }),
        ),
      ),
  }
}
