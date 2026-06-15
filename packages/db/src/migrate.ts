import { type Logger, createNoopLogger } from "@spectrum/logger"
import { type Result, err, ok } from "@spectrum/utils"
import type { DbClient } from "./client"
import type { DbError } from "./errors"
import { bundledMigrations } from "./migrations.generated"

// Migrations are inlined into the bundle (see migrations.generated.ts) so the
// packaged Electrobun app applies them from bundled data and never reads a
// migrations folder at runtime.

const CREATE_TRACKING_TABLE = `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL
)`

const SELECT_APPLIED = "SELECT 1 FROM __drizzle_migrations WHERE tag = ?"
const INSERT_APPLIED =
  "INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)"
const COUNT_APPLIED = "SELECT COUNT(*) AS n FROM __drizzle_migrations"
const SELECT_USER_TABLES = `SELECT name FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
    AND name != '__drizzle_migrations'`

const detailOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Greenfield reset: when no migration has ever been recorded, any pre-existing
 * app tables come from the legacy (pre-Drizzle) hand-written schema. Session
 * history is disposable, so drop those tables and let migrations recreate them
 * from scratch — otherwise the first migration's plain `CREATE TABLE` fails with
 * "table already exists" and the app cannot start. Identifiers come from
 * sqlite_master (this DB), never from user input.
 */
const dropLegacyTables = (connection: DbClient["connection"]): void => {
  const tables = connection
    .query(SELECT_USER_TABLES)
    .all()
    .map((row) => String((row as { name: unknown }).name))
  for (const name of tables) {
    connection.run(`DROP TABLE IF EXISTS "${name}"`)
  }
}

/** Apply all pending bundled migrations. Forward-only; tracked in __drizzle_migrations by tag. */
export const runMigrations = (
  client: DbClient,
  deps: { logger?: Logger } = {},
): Result<void, DbError> => {
  const logger = deps.logger ?? createNoopLogger()
  const { connection } = client
  try {
    connection.run(CREATE_TRACKING_TABLE)

    const applied = connection.query(COUNT_APPLIED).get() as { n: number }
    if (applied.n === 0) {
      dropLegacyTables(connection)
    }

    for (const migration of bundledMigrations) {
      const already = connection.query(SELECT_APPLIED).get(migration.tag)
      if (already) continue

      connection.transaction(() => {
        for (const statement of migration.statements) {
          connection.run(statement)
        }
        connection.run(INSERT_APPLIED, [migration.tag, migration.when])
      })()
    }

    return ok(undefined)
  } catch (cause) {
    const detail = detailOf(cause)
    // Observation only — the Result below is the control-flow signal.
    logger.error("migration failed", { detail })
    return err({ kind: "migration-failed", detail })
  }
}
