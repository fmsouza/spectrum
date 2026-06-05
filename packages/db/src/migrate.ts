import { join } from "node:path"
import { type Result, err, ok } from "@launchkit/utils"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import type { DbClient } from "./client"
import type { DbError } from "./errors"

// Resolve the migrations folder relative to THIS source file so it works in dev
// and when bundled. import.meta.dir is the directory of this module (Bun).
const MIGRATIONS_FOLDER = join(import.meta.dir, "migrations")

const detailOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Apply all pending committed migrations. Forward-only; tracked in __drizzle_migrations. */
export const runMigrations = (client: DbClient): Result<void, DbError> => {
  try {
    migrate(client.handle, { migrationsFolder: MIGRATIONS_FOLDER })
    return ok(undefined)
  } catch (cause) {
    return err({ kind: "migration-failed", detail: detailOf(cause) })
  }
}
