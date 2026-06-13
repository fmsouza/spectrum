import { beforeEach, describe, expect, it } from "bun:test"
import {
  createSqliteClient,
  runMigrations,
  sessions as sessionsTable,
} from "@spectrum/db"
import type { DbClient } from "@spectrum/db"
import { createFixedClock, createSequentialIdGen } from "@spectrum/utils"
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

describe("ProjectStore.list", () => {
  it("returns projects alphabetically by name with their session counts", () => {
    const opened = createSqliteClient(":memory:")
    if (!opened.ok) throw new Error(opened.error.detail)
    const db = opened.value
    const migrated = runMigrations(db)
    if (!migrated.ok) throw new Error(migrated.error.detail)
    const store = createProjectStore({
      db,
      clock: createFixedClock(new Date("2026-06-07T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })

    const web = store.findOrCreateByPath("/work/web")
    const api = store.findOrCreateByPath("/work/api")
    if (!web.ok || !api.ok) throw new Error("seed failed")

    db.handle
      .insert(sessionsTable)
      .values([
        {
          id: "s1",
          harnessId: "claude",
          startedAt: "2026-06-07T10:00:00.000Z",
          projectId: api.value.id,
        },
        {
          id: "s2",
          harnessId: "claude",
          startedAt: "2026-06-07T11:00:00.000Z",
          projectId: api.value.id,
        },
        {
          id: "s3",
          harnessId: "claude",
          startedAt: "2026-06-07T12:00:00.000Z",
          projectId: web.value.id,
        },
      ])
      .run()

    const r = store.list()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.map((p) => p.name)).toEqual(["api", "web"])
    expect(r.value[0]?.sessionCount).toBe(2)
    expect(r.value[1]?.sessionCount).toBe(1)
  })

  it("includes a project with zero sessions", () => {
    const opened = createSqliteClient(":memory:")
    if (!opened.ok) throw new Error(opened.error.detail)
    const db = opened.value
    runMigrations(db)
    const store = createProjectStore({
      db,
      clock: createFixedClock(new Date("2026-06-07T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.findOrCreateByPath("/work/empty")
    const r = store.list()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value[0]?.sessionCount).toBe(0)
  })
})
