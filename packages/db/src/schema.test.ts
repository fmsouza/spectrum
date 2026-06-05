import { describe, expect, it } from "bun:test"
import { getTableConfig } from "drizzle-orm/sqlite-core"
import { sessions } from "./schema"

describe("sessions schema", () => {
  it("names the table 'sessions' with the expected columns when defined", () => {
    const config = getTableConfig(sessions)
    expect(config.name).toBe("sessions")
    const columnNames = config.columns.map((c) => c.name).sort()
    expect(columnNames).toEqual(
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
  })

  it("marks id as primary key and harnessId/startedAt as not null when defined", () => {
    const config = getTableConfig(sessions)
    const byName = (n: string) => config.columns.find((c) => c.name === n)
    expect(byName("id")?.primary).toBe(true)
    expect(byName("harnessId")?.notNull).toBe(true)
    expect(byName("startedAt")?.notNull).toBe(true)
    expect(byName("modelId")?.notNull).toBe(false)
  })

  it("declares indexes on startedAt and harnessId when defined", () => {
    const config = getTableConfig(sessions)
    const indexNames = config.indexes.map((i) => i.config.name).sort()
    expect(indexNames).toEqual(
      ["idx_sessions_harnessId", "idx_sessions_startedAt"].sort(),
    )
  })
})
