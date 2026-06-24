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

describe("SessionStore.get", () => {
  it("returns the session row for a known id", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const r = store.get(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value?.id).toBe(created.value.id)
    expect(r.value?.harnessId).toBe(created.value.harnessId)
    expect(r.value?.startedAt).toBe(created.value.startedAt)
  })

  it("returns undefined for an unknown id", () => {
    const store = makeStore()
    const r = store.get("s_nope" as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBeUndefined()
  })

  it("surfaces resumeId after it has been set", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    expect(isOk(store.setResumeId(created.value.id, "harness-native-id"))).toBe(
      true,
    )
    const r = store.get(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value?.resumeId).toBe("harness-native-id")
  })

  it("omits resumeId from the returned session when it has not been set", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      projectId: "prj_x" as never,
      cwd: "/x",
    })
    if (!isOk(created)) throw new Error("create failed")
    const r = store.get(created.value.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value?.resumeId).toBeUndefined()
  })
})
