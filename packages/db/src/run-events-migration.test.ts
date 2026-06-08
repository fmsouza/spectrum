import { describe, expect, it } from "bun:test"
import { createSqliteClient } from "./client"
import { runMigrations } from "./migrate"

describe("run_events migration", () => {
  it("creates the run_events table with the runner index when migrated fresh", () => {
    const opened = createSqliteClient(":memory:")
    if (!opened.ok) throw new Error(opened.error.detail)
    const client = opened.value

    const migrated = runMigrations(client)
    expect(migrated.ok).toBe(true)

    const tables = client.connection
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(tables).toContain("run_events")

    const cols = client.connection
      .query("PRAGMA table_info(run_events)")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(cols).toEqual(
      expect.arrayContaining([
        "sessionId",
        "seq",
        "runnerId",
        "type",
        "payload",
        "ts",
      ]),
    )

    const indexes = client.connection
      .query("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => String((r as { name: unknown }).name))
    expect(indexes).toContain("idx_run_events_runner")
  })
})
