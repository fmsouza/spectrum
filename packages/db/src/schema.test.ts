import { describe, expect, it } from "bun:test"
import { getTableConfig } from "drizzle-orm/sqlite-core"
import { projects, sessions } from "./schema"

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
        "projectId",
        "resumeId",
        "startedAt",
      ].sort(),
    )
  })

  it("marks id as primary key and harnessId/startedAt/projectId as not null when defined", () => {
    const config = getTableConfig(sessions)
    const byName = (n: string) => config.columns.find((c) => c.name === n)
    expect(byName("id")?.primary).toBe(true)
    expect(byName("harnessId")?.notNull).toBe(true)
    expect(byName("startedAt")?.notNull).toBe(true)
    expect(byName("projectId")?.notNull).toBe(true)
    expect(byName("modelId")?.notNull).toBe(false)
  })

  it("declares indexes on startedAt, harnessId, and projectId when defined", () => {
    const config = getTableConfig(sessions)
    const indexNames = config.indexes.map((i) => i.config.name).sort()
    expect(indexNames).toEqual(
      [
        "idx_sessions_harnessId",
        "idx_sessions_projectId",
        "idx_sessions_startedAt",
      ].sort(),
    )
  })
})

describe("projects schema", () => {
  it("names the table 'projects' with the expected columns when defined", () => {
    const config = getTableConfig(projects)
    expect(config.name).toBe("projects")
    const columnNames = config.columns.map((c) => c.name).sort()
    expect(columnNames).toEqual(["createdAt", "id", "name", "path"].sort())
  })

  it("marks id as primary key and name/path/createdAt as not null when defined", () => {
    const config = getTableConfig(projects)
    const byName = (n: string) => config.columns.find((c) => c.name === n)
    expect(byName("id")?.primary).toBe(true)
    expect(byName("name")?.notNull).toBe(true)
    expect(byName("path")?.notNull).toBe(true)
    expect(byName("createdAt")?.notNull).toBe(true)
  })
})
