import { describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@spectrum/db"
import { createFixedClock, createSequentialIdGen, isOk } from "@spectrum/utils"
import { createSessionStore } from "./store"

const makeStore = () => {
  const opened = createSqliteClient(":memory:")
  if (!isOk(opened)) throw new Error("open failed")
  const client = opened.value
  expect(isOk(runMigrations(client))).toBe(true)
  const clock = createFixedClock(new Date("2026-06-27T10:00:00.000Z"))
  const idGen = createSequentialIdGen()
  return createSessionStore({ db: client, clock, idGen })
}

describe("SessionStore.findById", () => {
  it("returns the DB row including projectId for a known id", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const r = store.findById(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value?.id).toBe(created.value.id)
    expect(r.value?.projectId).toBe("prj_x")
    expect(r.value?.cwd).toBe("/x")
  })

  it("returns undefined for an unknown id", () => {
    const store = makeStore()
    const r = store.findById("s_nope" as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBeUndefined()
  })
})
