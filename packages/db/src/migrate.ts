import { type Result, err, ok } from "@launchkit/utils"
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

const detailOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Apply all pending bundled migrations. Forward-only; tracked in __drizzle_migrations by tag. */
export const runMigrations = (client: DbClient): Result<void, DbError> => {
  const { connection } = client
  try {
    connection.run(CREATE_TRACKING_TABLE)

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
    return err({ kind: "migration-failed", detail: detailOf(cause) })
  }
}
