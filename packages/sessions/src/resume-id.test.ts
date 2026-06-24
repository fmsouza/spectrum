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

describe("SessionStore.setResumeId", () => {
  it("persists the resumeId on the session row and returns the updated session", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const r = store.setResumeId(created.value.id, "claude-sess-123")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.resumeId).toBe("claude-sess-123")
  })

  it("is idempotent when the same resumeId is set twice", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    expect(isOk(store.setResumeId(created.value.id, "abc"))).toBe(true)
    const again = store.setResumeId(created.value.id, "abc")
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.value.resumeId).toBe("abc")
  })

  it("returns not-found for an unknown session id", () => {
    const store = makeStore()
    const r = store.setResumeId("s_nope" as never, "abc")
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe("not-found")
  })

  it("overwrites a previously-set resumeId", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    expect(isOk(store.setResumeId(created.value.id, "first"))).toBe(true)
    const updated = store.setResumeId(created.value.id, "second")
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.resumeId).toBe("second")
  })
})
