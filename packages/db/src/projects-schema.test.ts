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
})
