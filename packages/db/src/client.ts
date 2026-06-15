import { Database as BunDatabase } from "bun:sqlite"
import { type Logger, createNoopLogger } from "@spectrum/logger"
import { type Result, err, ok } from "@spectrum/utils"
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

export const createSqliteClient = (
  path: string,
  deps: { logger?: Logger } = {},
): Result<DbClient, DbError> => {
  const logger = deps.logger ?? createNoopLogger()
  try {
    const connection = new BunDatabase(path)
    const handle = drizzle({ client: connection, schema })
    return ok({ handle, connection })
  } catch (cause) {
    const detail = detailOf(cause)
    // Observation only — the Result below is the control-flow signal.
    logger.error("sqlite open failed", { detail })
    return err({ kind: "open-failed", detail })
  }
}
