import { basename } from "node:path"
import { type DbClient, projects, sessions, tryDb } from "@spectrum/db"
import type { Project, ProjectId } from "@spectrum/types"
import {
  type Clock,
  type IdGen,
  type Result,
  err,
  isErr,
  ok,
} from "@spectrum/utils"
import { eq, sql } from "drizzle-orm"
import type { ProjectError } from "./errors"

export type { ProjectError } from "./errors"

/** A project plus its total session count. */
export type ProjectWithCount = Project & { readonly sessionCount: number }

export interface ProjectStore {
  /** Dedupes on path: returns the existing project for a known path, else creates one. */
  findOrCreateByPath(path: string): Result<Project, ProjectError>
  /** Alphabetical (case-insensitive) by name; each row carries its session count. */
  list(): Result<readonly ProjectWithCount[], ProjectError>
}

type ProjectRow = typeof projects.$inferSelect

const toProject = (row: ProjectRow): Project => ({
  id: row.id as ProjectId,
  name: row.name,
  path: row.path,
  createdAt: row.createdAt,
})

/** Convert a DbError boundary failure into the store's ProjectError. */
const asProjectError = <T>(
  r: Result<T, { readonly detail: string }>,
): Result<T, ProjectError> =>
  isErr(r) ? err({ kind: "db-failed", detail: r.error.detail }) : r

export const createProjectStore = (deps: {
  readonly db: DbClient
  readonly clock: Clock
  readonly idGen: IdGen
}): ProjectStore => {
  const { handle } = deps.db

  return {
    findOrCreateByPath: (path: string): Result<Project, ProjectError> => {
      const trimmed = path.trim()
      if (trimmed === "") return err({ kind: "invalid-path" })

      const existing = asProjectError(
        tryDb(() =>
          handle
            .select()
            .from(projects)
            .where(eq(projects.path, trimmed))
            .get(),
        ),
      )
      if (isErr(existing)) return existing
      if (existing.value !== undefined) return ok(toProject(existing.value))

      const id = deps.idGen.next("prj") as ProjectId
      const createdAt = deps.clock.now().toISOString()
      const name = basename(trimmed)
      const written = asProjectError(
        tryDb(() =>
          handle
            .insert(projects)
            .values({ id, name, path: trimmed, createdAt })
            .run(),
        ),
      )
      if (isErr(written)) return written
      return ok({ id, name, path: trimmed, createdAt })
    },

    list: (): Result<readonly ProjectWithCount[], ProjectError> => {
      const rows = asProjectError(
        tryDb(() =>
          handle
            .select({
              id: projects.id,
              name: projects.name,
              path: projects.path,
              createdAt: projects.createdAt,
              sessionCount: sql<number>`count(${sessions.id})`,
            })
            .from(projects)
            .leftJoin(sessions, eq(sessions.projectId, projects.id))
            .groupBy(projects.id)
            .orderBy(sql`lower(${projects.name})`)
            .all(),
        ),
      )
      if (isErr(rows)) return rows
      return ok(
        rows.value.map((r) => ({
          id: r.id as ProjectId,
          name: r.name,
          path: r.path,
          createdAt: r.createdAt,
          sessionCount: Number(r.sessionCount),
        })),
      )
    },
  }
}
