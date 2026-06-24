import { describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@spectrum/db"
import { createFixedClock, createSequentialIdGen, isOk } from "@spectrum/utils"
import { createSessionStore } from "./store"

const makeStore = () => {
  const opened = createSqliteClient(":memory:")
  if (!isOk(opened)) throw new Error("open failed")
  const client = opened.value
  expect(isOk(runMigrations(client))).toBe(true)
  const clock = createFixedClock(new Date("2026-06-08T12:00:00.000Z"))
  const idGen = createSequentialIdGen()
  return createSessionStore({ db: client, clock, idGen })
}

describe("SessionStore.reopen", () => {
  it("clears endedAt and exitCode so an ended session is live again", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    expect(isOk(store.close(created.value.id, 0))).toBe(true)
    const r = store.reopen(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.endedAt).toBeUndefined()
    expect(r.value.exitCode).toBeUndefined()
  })

  it("is a no-op on a session that is already live", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const r = store.reopen(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.endedAt).toBeUndefined()
    expect(r.value.exitCode).toBeUndefined()
  })

  it("returns not-found for an unknown session id", () => {
    const store = makeStore()
    const r = store.reopen("s_nope" as never)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe("not-found")
  })
})
