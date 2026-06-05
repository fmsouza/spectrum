import { describe, expect, it } from "bun:test"
import { isOk } from "@launchkit/utils"
import { createSqliteClient } from "./client"
import { runMigrations } from "./migrate"

const tableNames = (client: { connection: import("bun:sqlite").Database }) =>
  client.connection
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => String((r as { name: unknown }).name))

const sessionColumns = (client: {
  connection: import("bun:sqlite").Database
}) =>
  client.connection
    .query("PRAGMA table_info(sessions)")
    .all()
    .map((r) => String((r as { name: unknown }).name))
    .sort()

describe("runMigrations", () => {
  it("creates the sessions table and its indexes on a fresh in-memory db", () => {
    const opened = createSqliteClient(":memory:")
    expect(isOk(opened)).toBe(true)
    if (!isOk(opened)) return
    const client = opened.value

    const r = runMigrations(client)
    expect(isOk(r)).toBe(true)

    expect(tableNames(client)).toContain("sessions")
    expect(sessionColumns(client)).toEqual(
      [
        "cwd",
        "endedAt",
        "exitCode",
        "harnessId",
        "id",
        "modelId",
        "name",
        "startedAt",
      ].sort(),
    )

    const indexes = client.connection
      .query("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(indexes).toContain("idx_sessions_startedAt")
    expect(indexes).toContain("idx_sessions_harnessId")
  })

  it("is idempotent — running migrations twice does not error", () => {
    const opened = createSqliteClient(":memory:")
    if (!isOk(opened)) throw new Error("open failed")
    const client = opened.value
    expect(isOk(runMigrations(client))).toBe(true)
    expect(isOk(runMigrations(client))).toBe(true)
    expect(tableNames(client)).toContain("sessions")
  })

  it("wipes a legacy pre-Drizzle sessions table and recreates it from migrations", () => {
    const opened = createSqliteClient(":memory:")
    if (!isOk(opened)) throw new Error("open failed")
    const client = opened.value

    // Simulate a DB created by the OLD hand-written code: a `sessions` table
    // (with stale data) and NO migration tracking at all.
    client.connection.run(
      "CREATE TABLE sessions (id TEXT PRIMARY KEY, harnessId TEXT, legacyColumn TEXT)",
    )
    client.connection.run(
      "INSERT INTO sessions (id, harnessId, legacyColumn) VALUES ('old', 'claude', 'stale')",
    )

    // Greenfield: migrations own the schema, so the legacy table is dropped and
    // recreated. runMigrations must succeed (not throw 'table already exists').
    const r = runMigrations(client)
    expect(isOk(r)).toBe(true)

    // The recreated table has the Drizzle schema (no legacyColumn) and the stale
    // row is gone — session history is disposable under the greenfield decision.
    expect(sessionColumns(client)).toEqual(
      [
        "cwd",
        "endedAt",
        "exitCode",
        "harnessId",
        "id",
        "modelId",
        "name",
        "startedAt",
      ].sort(),
    )
    const remaining = client.connection
      .query("SELECT COUNT(*) AS n FROM sessions")
      .get() as { n: number }
    expect(remaining.n).toBe(0)
    // 0000 is now tracked.
    const tracked = client.connection
      .query("SELECT tag FROM __drizzle_migrations")
      .all()
      .map((row) => String((row as { tag: unknown }).tag))
    expect(tracked).toEqual(["0000_sad_turbo"])
  })

  it("tracks applied migrations in a tracking table, with no folder dependency", () => {
    const opened = createSqliteClient(":memory:")
    if (!isOk(opened)) throw new Error("open failed")
    const client = opened.value

    expect(isOk(runMigrations(client))).toBe(true)
    expect(isOk(runMigrations(client))).toBe(true)

    const rows = client.connection
      .query("SELECT tag FROM __drizzle_migrations WHERE tag = ?")
      .all("0000_sad_turbo")
      .map((r) => String((r as { tag: unknown }).tag))

    expect(rows).toEqual(["0000_sad_turbo"])
  })
})
