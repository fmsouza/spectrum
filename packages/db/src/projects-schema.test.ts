import { describe, expect, it } from "bun:test"
import { createSqliteClient } from "./client"
import { runMigrations } from "./migrate"

describe("projects schema migration", () => {
  it("creates the projects table and a projectId column on sessions when migrated fresh", () => {
    const opened = createSqliteClient(":memory:")
    if (!opened.ok) throw new Error(opened.error.detail)
    const client = opened.value

    const migrated = runMigrations(client)
    expect(migrated.ok).toBe(true)

    const tables = client.connection
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(tables).toContain("projects")

    const cols = client.connection
      .query("PRAGMA table_info(sessions)")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(cols).toContain("projectId")
  })

  it("upgrades a populated pre-projects DB by dropping old sessions and adding projects", () => {
    // Reproduce an existing install: the 0000 schema with session rows and 0000
    // recorded as applied, so the greenfield reset does NOT run and migration
    // 0001 must apply against a populated `sessions` table.
    const opened = createSqliteClient(":memory:")
    if (!opened.ok) throw new Error(opened.error.detail)
    const { connection } = opened.value
    connection.run(
      "CREATE TABLE `sessions` (`id` text PRIMARY KEY NOT NULL, `harnessId` text NOT NULL, `modelId` text, `startedAt` text NOT NULL, `endedAt` text, `exitCode` integer, `name` text, `cwd` text)",
    )
    connection.run(
      "CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`)",
    )
    connection.run(
      "CREATE INDEX `idx_sessions_harnessId` ON `sessions` (`harnessId`)",
    )
    connection.run(
      "INSERT INTO `sessions` (`id`, `harnessId`, `startedAt`, `cwd`) VALUES ('s1', 'claude', '2026-06-06T00:00:00.000Z', '/work/api')",
    )
    connection.run(
      "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT NOT NULL UNIQUE, applied_at INTEGER NOT NULL)",
    )
    connection.run(
      "INSERT INTO __drizzle_migrations (tag, applied_at) VALUES ('0000_sad_turbo', 0)",
    )

    const migrated = runMigrations(opened.value)
    expect(migrated.ok).toBe(true)

    const tables = connection
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(tables).toContain("projects")

    const cols = connection
      .query("PRAGMA table_info(sessions)")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(cols).toContain("projectId")

    // History is intentionally dropped (the chosen upgrade behavior).
    const count = connection
      .query("SELECT count(*) AS n FROM sessions")
      .get() as { n: number }
    expect(count.n).toBe(0)
  })
})
