import { describe, expect, it } from "bun:test"
import { getTableConfig } from "drizzle-orm/sqlite-core"
import { runEvents } from "./schema"

describe("run_events schema", () => {
  it("names the table 'run_events' with the expected columns when defined", () => {
    const config = getTableConfig(runEvents)
    expect(config.name).toBe("run_events")
    const columnNames = config.columns.map((c) => c.name).sort()
    expect(columnNames).toEqual(
      ["payload", "runnerId", "seq", "sessionId", "ts", "type"].sort(),
    )
  })

  it("marks every column not null when defined", () => {
    const config = getTableConfig(runEvents)
    for (const col of config.columns) expect(col.notNull).toBe(true)
  })

  it("declares a composite primary key on (sessionId, seq) when defined", () => {
    const config = getTableConfig(runEvents)
    expect(config.primaryKeys).toHaveLength(1)
    const pkColumns = config.primaryKeys[0]?.columns.map((c) => c.name).sort()
    expect(pkColumns).toEqual(["seq", "sessionId"].sort())
  })

  it("declares the idx_run_events_runner index when defined", () => {
    const config = getTableConfig(runEvents)
    const indexNames = config.indexes.map((i) => i.config.name)
    expect(indexNames).toContain("idx_run_events_runner")
  })
})
