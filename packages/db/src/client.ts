import { Database as BunDatabase } from "bun:sqlite"
import { type Result, err, ok } from "@launchkit/utils"
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite"
import type { DbError } from "./errors"
import * as schema from "./schema"

/**
 * The injected sqlite effect. `handle` is the typed Drizzle query builder; `connection`
 * is the raw bun:sqlite handle, used only by the migrator. Never reached around elsewhere.
 */
export interface DbClient {
  readonly handle: BunSQLiteDatabase<typeof schema>
  readonly connection: BunDatabase
}

const detailOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

export const createSqliteClient = (path: string): Result<DbClient, DbError> => {
  try {
    const connection = new BunDatabase(path)
    const handle = drizzle({ client: connection, schema })
    return ok({ handle, connection })
  } catch (cause) {
    return err({ kind: "open-failed", detail: detailOf(cause) })
  }
}
