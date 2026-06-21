import { describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@spectrum/db"
import { createFixedClock, createSequentialIdGen, isOk } from "@spectrum/utils"
import { createSessionStore } from "./store"

const makeStore = () => {
  const opened = createSqliteClient(":memory:")
  if (!isOk(opened)) throw new Error("open failed")
  const client = opened.value
  expect(isOk(runMigrations(client))).toBe(true)
  const clock = createFixedClock(new Date("2026-05-23T10:00:00.000Z"))
  const idGen = createSequentialIdGen()
  return createSessionStore({ db: client, clock, idGen })
}

describe("SessionStore.updateName", () => {
  it("updates the name and returns the updated Session row", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const updated = store.updateName(created.value.id, "Fix the bug")
    expect(isOk(updated) && updated.value).toEqual({
      id: created.value.id,
      harnessId: "claude" as never,
      startedAt: "2026-05-23T10:00:00.000Z",
      cwd: "/x",
      name: "Fix the bug",
    })
  })

  it("returns not-found when the id is unknown", () => {
    const store = makeStore()
    expect(store.updateName("s_nope" as never, "x")).toEqual({
      ok: false,
      error: { kind: "not-found" },
    })
  })

  it("returns invalid-name for a blank or whitespace-only name", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    expect(store.updateName(created.value.id, "   ")).toEqual({
      ok: false,
      error: { kind: "invalid-name" },
    })
    expect(store.updateName(created.value.id, "")).toEqual({
      ok: false,
      error: { kind: "invalid-name" },
    })
  })

  it("overwrites a previously-set name", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
      name: "first",
    })
    if (!isOk(created)) throw new Error("create failed")
    const updated = store.updateName(created.value.id, "second")
    expect(isOk(updated) && updated.value.name).toBe("second")
  })

  it("preserves the trimmed name (does not store surrounding whitespace)", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const updated = store.updateName(created.value.id, "  trimmed  ")
    expect(isOk(updated) && updated.value.name).toBe("trimmed")
  })
})
