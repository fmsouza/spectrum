import { describe, expect, it } from "bun:test"
import { createSqliteClient, runMigrations } from "@launchkit/db"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
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

describe("createSessionStore on drizzle", () => {
  it("round-trips create -> close -> query against a migrated in-memory db", () => {
    const store = makeStore()
    const created = store.create({
      harnessId: "claude" as never,
      modelId: "mdl_default" as never,
    })
    expect(isOk(created) && created.value).toEqual<
      | false
      | { id: string; harnessId: string; modelId: string; startedAt: string }
    >({
      id: "s_1",
      harnessId: "claude",
      modelId: "mdl_default",
      startedAt: "2026-05-23T10:00:00.000Z",
    })

    const closed = store.close("s_1" as never, 0)
    expect(isOk(closed) && closed.value).toEqual<
      | false
      | {
          id: string
          harnessId: string
          modelId: string
          startedAt: string
          endedAt: string
          exitCode: number
        }
    >({
      id: "s_1",
      harnessId: "claude",
      modelId: "mdl_default",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:00:00.000Z",
      exitCode: 0,
    })

    const all = store.query()
    expect(isOk(all) && all.value.map((s) => s.id)).toEqual<
      false | readonly string[]
    >(["s_1"])
  })

  it("returns not-found when close targets a missing row", () => {
    const store = makeStore()
    expect(store.close("s_nope" as never, 0)).toEqual({
      ok: false,
      error: { kind: "not-found" },
    })
  })

  it("filters by harnessId via the query builder", () => {
    const store = makeStore()
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "codex" as never })
    const r = store.query({ harnessId: "codex" as never })
    expect(isOk(r) && r.value.map((s) => s.harnessId)).toEqual<
      false | readonly string[]
    >(["codex"])
  })

  it("returns only open sessions when running is true and closed when false", () => {
    const store = makeStore()
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "codex" as never })
    store.close("s_1" as never, 0)
    const open = store.query({ running: true })
    expect(isOk(open) && open.value.map((s) => s.id)).toEqual<
      false | readonly string[]
    >(["s_2"])
    const closed = store.query({ running: false })
    expect(isOk(closed) && closed.value.map((s) => s.id)).toEqual<
      false | readonly string[]
    >(["s_1"])
  })

  it("returns tail rows when query uses offset with no limit", () => {
    const store = makeStore()
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "claude" as never })
    const r = store.query({ offset: 1 })
    expect(isOk(r) && r.value.length).toBe(2)
  })

  it("limits and offsets the result when query paginates", () => {
    const store = makeStore()
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "claude" as never })
    const page = store.query({ limit: 1, offset: 1 })
    expect(isOk(page) && page.value.length).toBe(1)
  })

  it("reconciles orphaned open sessions to the clock timestamp", () => {
    const store = makeStore()
    store.create({ harnessId: "claude" as never })
    store.create({ harnessId: "codex" as never })
    const r = store.reconcileOrphaned()
    expect(isOk(r) && r.value).toBe(2)
    const stillOpen = store.query({ running: true })
    expect(isOk(stillOpen) && stillOpen.value.length).toBe(0)
    const again = store.reconcileOrphaned()
    expect(isOk(again) && again.value).toBe(0)
  })
})
