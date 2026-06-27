import { beforeEach, describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@spectrum/db"
import { createFixedClock, createSequentialIdGen } from "@spectrum/utils"
import { type ProjectStore, createProjectStore } from "./store"

const makeStore = (): ProjectStore => {
  const opened = createSqliteClient(":memory:")
  if (!opened.ok) throw new Error(opened.error.detail)
  const db = opened.value
  const migrated = runMigrations(db)
  if (!migrated.ok) throw new Error(migrated.error.detail)
  return createProjectStore({
    db,
    clock: createFixedClock(new Date("2026-06-27T10:00:00.000Z")),
    idGen: createSequentialIdGen(),
  })
}

describe("ProjectStore.findById", () => {
  let store: ProjectStore
  beforeEach(() => {
    store = makeStore()
  })

  it("returns the project for a known id", () => {
    const created = store.findOrCreateByPath("/work/api")
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const r = store.findById(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value?.id).toBe(created.value.id)
    expect(r.value?.path).toBe("/work/api")
    expect(r.value?.name).toBe("api")
  })

  it("returns undefined for an unknown id", () => {
    const r = store.findById("prj_nope" as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBeUndefined()
  })
})
