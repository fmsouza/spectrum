import { describe, expect, it } from "bun:test"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
import { createBunSqliteDatabase } from "./bun-sqlite"
import { createSessionStore } from "./store"

describe("createBunSqliteDatabase + SessionStore", () => {
  it("round-trips init -> create -> close -> query against real bun:sqlite when run end-to-end", () => {
    const db = createBunSqliteDatabase(":memory:")
    const clock = createFixedClock(new Date("2026-05-23T10:00:00.000Z"))
    const idGen = createSequentialIdGen()
    const store = createSessionStore({ db, clock, idGen })

    expect(isOk(store.init())).toBe(true)

    const created = store.create({
      harnessId: "claude" as never,
      alias: "default" as never,
    })
    expect(isOk(created) && created.value).toEqual<
      | false
      | { id: string; harnessId: string; alias: string; startedAt: string }
    >({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
    })

    const closed = store.close("s_1" as never, 0)
    expect(isOk(closed) && closed.value).toEqual<
      | false
      | {
          id: string
          harnessId: string
          alias: string
          startedAt: string
          endedAt: string
          exitCode: number
        }
    >({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:00:00.000Z",
      exitCode: 0,
    })

    const all = store.query()
    expect(isOk(all) && all.value.map((s) => s.id)).toEqual<false | string[]>([
      "s_1",
    ])
  })

  it("returns a not-found error when close() targets a missing row against real bun:sqlite", () => {
    const db = createBunSqliteDatabase(":memory:")
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    const r = store.close("s_nope" as never, 0)
    expect(r).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("filters by harnessId via bound parameters when query() runs against real bun:sqlite", () => {
    const db = createBunSqliteDatabase(":memory:")
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    store.create({ harnessId: "claude" as never, alias: "default" as never })
    store.create({ harnessId: "codex" as never, alias: "fast" as never })
    const r = store.query({ harnessId: "codex" as never })
    expect(isOk(r) && r.value.map((s) => s.harnessId)).toEqual<
      false | string[]
    >(["codex"])
  })
})

describe("createSessionStore.init column migration against real bun:sqlite", () => {
  // The pre-v?? table shape: no name/cwd columns.
  const LEGACY_CREATE_TABLE = `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    harnessId TEXT NOT NULL,
    alias TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    endedAt TEXT,
    exitCode INTEGER
  )`

  const columnNames = (
    db: ReturnType<typeof createBunSqliteDatabase>,
  ): string[] => {
    const info = db.all("PRAGMA table_info(sessions)", [])
    if (!isOk(info)) return []
    return info.value.map((row) => String(row.name))
  }

  it("adds name and cwd columns to a legacy sessions table when init() runs", () => {
    const db = createBunSqliteDatabase(":memory:")
    expect(isOk(db.exec(LEGACY_CREATE_TABLE))).toBe(true)
    expect(columnNames(db)).not.toContain("name")
    expect(columnNames(db)).not.toContain("cwd")

    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    expect(isOk(store.init())).toBe(true)

    const cols = columnNames(db)
    expect(cols).toContain("name")
    expect(cols).toContain("cwd")
  })

  it("is idempotent — running init() twice on a legacy table does not error", () => {
    const db = createBunSqliteDatabase(":memory:")
    expect(isOk(db.exec(LEGACY_CREATE_TABLE))).toBe(true)
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    expect(isOk(store.init())).toBe(true)
    expect(isOk(store.init())).toBe(true)
    const cols = columnNames(db)
    expect(cols.filter((c) => c === "name")).toHaveLength(1)
    expect(cols.filter((c) => c === "cwd")).toHaveLength(1)
  })

  it("adds name and cwd on a fresh database created by init() alone", () => {
    const db = createBunSqliteDatabase(":memory:")
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    expect(isOk(store.init())).toBe(true)
    const cols = columnNames(db)
    expect(cols).toContain("name")
    expect(cols).toContain("cwd")
  })
})

describe("createSessionStore.query running filter against real bun:sqlite", () => {
  it("returns only open sessions when query() filters running true", () => {
    const db = createBunSqliteDatabase(":memory:")
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    store.create({ harnessId: "claude" as never, alias: "default" as never })
    store.create({ harnessId: "codex" as never, alias: "fast" as never })
    store.close("s_1" as never, 0)

    const open = store.query({ running: true })
    expect(isOk(open) && open.value.map((s) => s.id)).toEqual<false | string[]>(
      ["s_2"],
    )

    const closed = store.query({ running: false })
    expect(isOk(closed) && closed.value.map((s) => s.id)).toEqual<
      false | string[]
    >(["s_1"])
  })

  it("limits and offsets the startedAt DESC result when query() paginates against real bun:sqlite", () => {
    const db = createBunSqliteDatabase(":memory:")
    const store = createSessionStore({
      db,
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    db.run(
      "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
      ["s_a", "claude", "default", "2026-05-23T09:00:00.000Z"],
    )
    db.run(
      "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
      ["s_b", "claude", "default", "2026-05-23T10:00:00.000Z"],
    )
    db.run(
      "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
      ["s_c", "claude", "default", "2026-05-23T11:00:00.000Z"],
    )
    const page = store.query({ limit: 1, offset: 1 })
    expect(isOk(page) && page.value.map((s) => s.id)).toEqual<false | string[]>(
      ["s_b"],
    )
  })
})
