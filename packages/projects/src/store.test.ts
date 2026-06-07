import { beforeEach, describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@launchkit/db"
import type { DbClient } from "@launchkit/db"
import { createFixedClock, createSequentialIdGen } from "@launchkit/utils"
import { type ProjectStore, createProjectStore } from "./store"

const makeStore = (): ProjectStore => {
  const opened = createSqliteClient(":memory:")
  if (!opened.ok) throw new Error(opened.error.detail)
  const db: DbClient = opened.value
  const migrated = runMigrations(db)
  if (!migrated.ok) throw new Error(migrated.error.detail)
  return createProjectStore({
    db,
    clock: createFixedClock(new Date("2026-06-07T10:00:00.000Z")),
    idGen: createSequentialIdGen(),
  })
}

describe("ProjectStore.findOrCreateByPath", () => {
  let store: ProjectStore
  beforeEach(() => {
    store = makeStore()
  })

  it("creates a project named after the folder basename when the path is new", () => {
    const r = store.findOrCreateByPath("/Users/fred/work/api")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.name).toBe("api")
    expect(r.value.path).toBe("/Users/fred/work/api")
  })

  it("returns the same project id when called twice with the same path", () => {
    const a = store.findOrCreateByPath("/Users/fred/work/api")
    const b = store.findOrCreateByPath("/Users/fred/work/api")
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.value.id).toBe(a.value.id)
  })

  it("returns invalid-path when the path is blank", () => {
    const r = store.findOrCreateByPath("   ")
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe("invalid-path")
  })
})
