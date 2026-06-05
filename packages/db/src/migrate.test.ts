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
})
