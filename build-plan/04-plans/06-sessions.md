# @launchkit/sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the history of launched harness instances in SQLite. Expose a `SessionStore` (`init` / `create` / `close` / `query`) over an injected `Database` effect, so unit tests run against a recording in-memory fake and a single integration test exercises real `bun:sqlite`.

**Architecture:** Effect-isolated. The SQL effect is the `Database` interface (`exec`/`run`/`all`/`get`), defined here and injected. `createSessionStore` is pure logic over `{ db, clock, idGen }` — it never imports `bun:sqlite`. Two adapters implement `Database`: `createInMemoryDatabase` (a recording array/Map-backed fake for unit tests that captures `{ sql, params }` so tests can assert every statement is **parameterized**) and `createBunSqliteDatabase` (the real `bun:sqlite` adapter with reused prepared statements). All fallible operations return `Result<T, SessionError>` — nothing throws.

**Tech Stack:** TypeScript (strict), `bun:test`, `bun:sqlite` (built-in — no external dep).

> Depends on: `types`, `utils` (both `done`). Read `01-conventions/functional-style.md`, `security.md` (SQLite: parameterized statements only), `performance.md` (index `startedAt`/`harnessId`; reuse prepared statements).
> Create the package via `launchkit-new-package`: `packages/sessions`, deps `@launchkit/types`, `@launchkit/utils`. No external runtime deps (`bun:sqlite` is built in).

---

### Task sessions-01: SessionError + Database interface + recording in-memory fake

**Files:**
- Create: `packages/sessions/src/db.ts`
- Test: `packages/sessions/src/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { isOk, isErr } from "@launchkit/utils"
import { createInMemoryDatabase, type RecordedStatement } from "./db"

describe("createInMemoryDatabase", () => {
  it("records each exec as a statement with empty params when exec() is called", () => {
    const db = createInMemoryDatabase()
    const r = db.exec("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY)")
    expect(isOk(r)).toBe(true)
    expect(db.statements()).toEqual([
      { sql: "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY)", params: [] },
    ] satisfies RecordedStatement[])
  })

  it("records the sql and params separately when run() is called", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id) VALUES (?)", ["s_1"])
    const recorded = db.statements()[0]
    expect(recorded?.sql).toContain("?")
    expect(recorded?.params).toEqual(["s_1"])
  })

  it("never interpolates a param value into the recorded sql when run() is called", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, alias) VALUES (?, ?)", ["s_1", "default"])
    const recorded = db.statements()[0]
    expect(recorded?.sql).not.toContain("s_1")
    expect(recorded?.sql).not.toContain("default")
  })

  it("round-trips an inserted row back through get() keyed by id", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)", [
      "s_1",
      "claude",
      "default",
      "2026-05-23T10:00:00.000Z",
    ])
    const r = db.get("SELECT * FROM sessions WHERE id = ?", ["s_1"])
    expect(isOk(r) && r.value).toEqual({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
    })
  })

  it("returns undefined from get() when no row matches the id", () => {
    const db = createInMemoryDatabase()
    const r = db.get("SELECT * FROM sessions WHERE id = ?", ["missing"])
    expect(isOk(r) && r.value).toBeUndefined()
  })

  it("applies a SET update keyed by the trailing id param when run() updates", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, startedAt) VALUES (?, ?)", ["s_1", "2026-05-23T10:00:00.000Z"])
    db.run("UPDATE sessions SET endedAt = ?, exitCode = ? WHERE id = ?", [
      "2026-05-23T10:05:00.000Z",
      0,
      "s_1",
    ])
    const r = db.get("SELECT * FROM sessions WHERE id = ?", ["s_1"])
    expect(isOk(r) && r.value).toEqual({
      id: "s_1",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:05:00.000Z",
      exitCode: 0,
    })
  })

  it("returns rows ordered by startedAt descending when all() selects without a WHERE", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, startedAt) VALUES (?, ?)", ["s_old", "2026-05-23T09:00:00.000Z"])
    db.run("INSERT INTO sessions (id, startedAt) VALUES (?, ?)", ["s_new", "2026-05-23T11:00:00.000Z"])
    const r = db.all("SELECT * FROM sessions ORDER BY startedAt DESC", [])
    expect(isOk(r) && r.value.map((row) => row.id)).toEqual(["s_new", "s_old"])
  })

  it("filters rows by the WHERE columns zipped with params when all() is called", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, harnessId, startedAt) VALUES (?, ?, ?)", ["s_1", "claude", "2026-05-23T09:00:00.000Z"])
    db.run("INSERT INTO sessions (id, harnessId, startedAt) VALUES (?, ?, ?)", ["s_2", "codex", "2026-05-23T10:00:00.000Z"])
    const r = db.all("SELECT * FROM sessions WHERE harnessId = ? ORDER BY startedAt DESC", ["claude"])
    expect(isOk(r) && r.value.map((row) => row.id)).toEqual(["s_1"])
  })

  it("treats a since filter as a startedAt >= comparison when all() is called", () => {
    const db = createInMemoryDatabase()
    db.run("INSERT INTO sessions (id, startedAt) VALUES (?, ?)", ["s_old", "2026-05-23T08:00:00.000Z"])
    db.run("INSERT INTO sessions (id, startedAt) VALUES (?, ?)", ["s_new", "2026-05-23T12:00:00.000Z"])
    const r = db.all("SELECT * FROM sessions WHERE startedAt >= ? ORDER BY startedAt DESC", ["2026-05-23T10:00:00.000Z"])
    expect(isOk(r) && r.value.map((row) => row.id)).toEqual(["s_new"])
  })

  it("never reports an error for the statements the store issues", () => {
    const db = createInMemoryDatabase()
    expect(isErr(db.exec("CREATE TABLE IF NOT EXISTS sessions (id TEXT)"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (module `./db` not found).

- [ ] **Step 3: Implement `db.ts`**

```typescript
import { type Result, ok, err } from "@launchkit/utils"

/** Typed failures for every sqlite operation. Never thrown — always returned. */
export type SessionError =
  | { readonly kind: "not-found" }
  | { readonly kind: "db-failed"; readonly detail: string }

/**
 * The injected sqlite effect. Parameter-bound only: values are passed in `params`,
 * never interpolated into `sql`. `exec` is for schema/DDL (no params).
 */
export interface Database {
  exec(sql: string): Result<void, SessionError>
  run(sql: string, params: readonly unknown[]): Result<void, SessionError>
  all(sql: string, params: readonly unknown[]): Result<readonly Record<string, unknown>[], SessionError>
  get(sql: string, params: readonly unknown[]): Result<Record<string, unknown> | undefined, SessionError>
}

/** A statement captured by the in-memory fake so tests can assert parameterization. */
export type RecordedStatement = { readonly sql: string; readonly params: readonly unknown[] }

/** Test-only recording fake. Captures every {sql, params} and minimally interprets the store's statements. */
export interface InMemoryDatabase extends Database {
  statements(): readonly RecordedStatement[]
}

type Row = Record<string, unknown>

const firstKeyword = (sql: string): string => (sql.trim().split(/\s+/, 1)[0] ?? "").toUpperCase()

/** Parse the `(a, b, c)` column list of an INSERT. */
const parseInsertColumns = (sql: string): readonly string[] => {
  const match = /\(([^)]*)\)\s*VALUES/i.exec(sql)
  if (match === null || match[1] === undefined) return []
  return match[1].split(",").map((c) => c.trim()).filter((c) => c.length > 0)
}

/** Parse the `SET a = ?, b = ?` assignment column names of an UPDATE, in order. */
const parseUpdateColumns = (sql: string): readonly string[] => {
  const match = /SET\s+(.*?)\s+WHERE/i.exec(sql)
  if (match === null || match[1] === undefined) return []
  return match[1]
    .split(",")
    .map((a) => (a.split("=", 1)[0] ?? "").trim())
    .filter((c) => c.length > 0)
}

/** A WHERE predicate parsed from `col OP ?` (OP is `=` or `>=`). */
type WhereTerm = { readonly column: string; readonly op: "=" | ">=" }

/** Parse `WHERE x = ? AND y >= ?` into ordered terms; returns [] when there is no WHERE. */
const parseWhereTerms = (sql: string): readonly WhereTerm[] => {
  const match = /WHERE\s+(.*?)(?:\s+ORDER\s+BY|\s*$)/i.exec(sql)
  if (match === null || match[1] === undefined) return []
  return match[1]
    .split(/\s+AND\s+/i)
    .map((clause): WhereTerm | undefined => {
      const ge = /^(\w+)\s*>=\s*\?$/.exec(clause.trim())
      if (ge !== null && ge[1] !== undefined) return { column: ge[1], op: ">=" }
      const eq = /^(\w+)\s*=\s*\?$/.exec(clause.trim())
      if (eq !== null && eq[1] !== undefined) return { column: eq[1], op: "=" }
      return undefined
    })
    .filter((t): t is WhereTerm => t !== undefined)
}

const matchesWhere = (row: Row, terms: readonly WhereTerm[], params: readonly unknown[]): boolean =>
  terms.every((term, i) => {
    const value = params[i]
    const cell = row[term.column]
    if (term.op === ">=") return typeof cell === "string" && typeof value === "string" && cell >= value
    return cell === value
  })

const compareDesc = (a: Row, b: Row): number => {
  const av = typeof a["startedAt"] === "string" ? (a["startedAt"] as string) : ""
  const bv = typeof b["startedAt"] === "string" ? (b["startedAt"] as string) : ""
  return av < bv ? 1 : av > bv ? -1 : 0
}

export const createInMemoryDatabase = (): InMemoryDatabase => {
  const rows = new Map<string, Row>()
  const log: RecordedStatement[] = []

  const record = (sql: string, params: readonly unknown[]): void => {
    log.push({ sql, params: [...params] })
  }

  return {
    statements: () => log,

    exec: (sql) => {
      record(sql, [])
      return ok(undefined)
    },

    run: (sql, params) => {
      record(sql, params)
      const keyword = firstKeyword(sql)
      if (keyword === "INSERT") {
        const columns = parseInsertColumns(sql)
        const row: Row = {}
        columns.forEach((col, i) => {
          row[col] = params[i]
        })
        const id = row["id"]
        if (typeof id === "string") rows.set(id, row)
        return ok(undefined)
      }
      if (keyword === "UPDATE") {
        const columns = parseUpdateColumns(sql)
        const id = params[params.length - 1]
        if (typeof id !== "string") return ok(undefined)
        const existing = rows.get(id)
        if (existing === undefined) return ok(undefined)
        const next: Row = { ...existing }
        columns.forEach((col, i) => {
          next[col] = params[i]
        })
        rows.set(id, next)
        return ok(undefined)
      }
      return ok(undefined)
    },

    all: (sql, params) => {
      record(sql, params)
      const terms = parseWhereTerms(sql)
      const matched = [...rows.values()].filter((row) => matchesWhere(row, terms, params))
      return ok([...matched].sort(compareDesc))
    },

    get: (sql, params) => {
      record(sql, params)
      const id = params[0]
      if (typeof id !== "string") return ok(undefined)
      return ok(rows.get(id))
    },
  }
}
```
> The fake records `{ sql, params }` *before* interpreting, so the parameterization tests in every later task can assert `?` placeholders live in `sql` and values live in `params`. `err` is imported for symmetry with the real adapter (sessions-06) which uses it on caught failures; remove the import here only if Biome flags it unused.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add SessionError + Database interface + recording in-memory fake [sessions-01]`.

---

### Task sessions-02: createSessionStore.init (schema + indexes)

**Files:**
- Create: `packages/sessions/src/store.ts`
- Test: `packages/sessions/src/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
import { createInMemoryDatabase } from "./db"
import { createSessionStore } from "./store"

const makeDeps = () => {
  const db = createInMemoryDatabase()
  const clock = createFixedClock(new Date("2026-05-23T10:00:00.000Z"))
  const idGen = createSequentialIdGen()
  return { db, clock, idGen }
}

describe("createSessionStore.init", () => {
  it("issues a CREATE TABLE IF NOT EXISTS statement when init() is called", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    const r = store.init()
    expect(isOk(r)).toBe(true)
    const sqls = deps.db.statements().map((s) => s.sql)
    expect(sqls.some((s) => /CREATE TABLE IF NOT EXISTS sessions/i.test(s))).toBe(true)
  })

  it("creates an index on startedAt when init() is called", () => {
    const deps = makeDeps()
    createSessionStore(deps).init()
    const sqls = deps.db.statements().map((s) => s.sql)
    expect(sqls.some((s) => /CREATE INDEX IF NOT EXISTS .*startedAt/i.test(s))).toBe(true)
  })

  it("creates an index on harnessId when init() is called", () => {
    const deps = makeDeps()
    createSessionStore(deps).init()
    const sqls = deps.db.statements().map((s) => s.sql)
    expect(sqls.some((s) => /CREATE INDEX IF NOT EXISTS .*harnessId/i.test(s))).toBe(true)
  })

  it("declares every Session column in the CREATE TABLE statement when init() is called", () => {
    const deps = makeDeps()
    createSessionStore(deps).init()
    const create = deps.db.statements().map((s) => s.sql).find((s) => /CREATE TABLE/i.test(s)) ?? ""
    for (const column of ["id", "harnessId", "alias", "startedAt", "endedAt", "exitCode"]) {
      expect(create).toContain(column)
    }
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (module `./store` not found).

- [ ] **Step 3: Implement `store.ts`**

```typescript
import type { Session, SessionId, HarnessId, AliasName } from "@launchkit/types"
import { type Result, ok, isErr, type Clock, type IdGen } from "@launchkit/utils"
import type { Database, SessionError } from "./db"

/** Fields the caller supplies; `id` and `startedAt` are generated by the store. */
export type SessionInput = { readonly harnessId: HarnessId; readonly alias: AliasName }

/** Optional, all-`AND` filter for `query`. `since` is an inclusive `startedAt >=` bound. */
export type SessionFilter = {
  readonly harnessId?: HarnessId
  readonly alias?: AliasName
  readonly since?: string
}

export interface SessionStore {
  init(): Result<void, SessionError>
  create(input: SessionInput): Result<Session, SessionError>
  close(id: SessionId, exitCode: number): Result<Session, SessionError>
  query(filter?: SessionFilter): Result<readonly Session[], SessionError>
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  harnessId TEXT NOT NULL,
  alias TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  exitCode INTEGER
)`

const CREATE_INDEX_STARTED = "CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sessions (startedAt)"
const CREATE_INDEX_HARNESS = "CREATE INDEX IF NOT EXISTS idx_sessions_harnessId ON sessions (harnessId)"

export const createSessionStore = (deps: {
  readonly db: Database
  readonly clock: Clock
  readonly idGen: IdGen
}): SessionStore => {
  const { db } = deps

  const init = (): Result<void, SessionError> => {
    const table = db.exec(CREATE_TABLE)
    if (isErr(table)) return table
    const started = db.exec(CREATE_INDEX_STARTED)
    if (isErr(started)) return started
    const harness = db.exec(CREATE_INDEX_HARNESS)
    if (isErr(harness)) return harness
    return ok(undefined)
  }

  return {
    init,
    create: () => {
      throw new Error("not implemented until sessions-03")
    },
    close: () => {
      throw new Error("not implemented until sessions-04")
    },
    query: () => {
      throw new Error("not implemented until sessions-05")
    },
  }
}
```
> The unimplemented methods `throw` *only* as a temporary scaffold so the file typechecks during TDD; sessions-03/04/05 replace each with a `Result`-returning body before any test exercises them. No shipped method throws.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add SessionStore.init with table + indexes [sessions-02]`.

---

### Task sessions-03: create (parameterized INSERT, generated id + ISO startedAt)

**Files:**
- Edit: `packages/sessions/src/store.ts`
- Test: `packages/sessions/src/store.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `store.test.ts`:

```typescript
describe("createSessionStore.create", () => {
  it("returns a Session with the id from idGen and ISO startedAt from the clock when create() is called", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    const r = store.create({ harnessId: "claude" as never, alias: "default" as never })
    expect(isOk(r) && r.value).toEqual({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
    })
  })

  it("issues a parameterized INSERT whose values live in params, not in the sql, when create() is called", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    store.create({ harnessId: "claude" as never, alias: "default" as never })
    const insert = deps.db.statements().find((s) => /^\s*INSERT/i.test(s.sql))
    expect(insert?.sql).toContain("?")
    expect(insert?.sql).not.toContain("s_1")
    expect(insert?.sql).not.toContain("claude")
    expect(insert?.sql).not.toContain("2026-05-23T10:00:00.000Z")
    expect(insert?.params).toEqual(["s_1", "claude", "default", "2026-05-23T10:00:00.000Z"])
  })

  it("uses the idGen prefix 's' for the generated session id when create() is called", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    const first = store.create({ harnessId: "claude" as never, alias: "default" as never })
    const second = store.create({ harnessId: "claude" as never, alias: "default" as never })
    expect(isOk(first) && first.value.id).toBe("s_1")
    expect(isOk(second) && second.value.id).toBe("s_2")
  })

  it("returns the db-failed error when the INSERT fails", () => {
    const failing = {
      ...makeDeps(),
      db: {
        exec: () => ({ ok: true as const, value: undefined }),
        run: () => ({ ok: false as const, error: { kind: "db-failed" as const, detail: "disk full" } }),
        all: () => ({ ok: true as const, value: [] }),
        get: () => ({ ok: true as const, value: undefined }),
      },
    }
    const store = createSessionStore(failing)
    const r = store.create({ harnessId: "claude" as never, alias: "default" as never })
    expect(r).toEqual({ ok: false, error: { kind: "db-failed", detail: "disk full" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (`create` throws "not implemented").

- [ ] **Step 3: Implement** — in `store.ts`, add the INSERT constant near the other SQL constants:

```typescript
const INSERT_SESSION = "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)"
```

Then replace the placeholder `create` in the returned object with the real body (it needs `clock` + `idGen` from `deps`):

```typescript
    create: (input: SessionInput): Result<Session, SessionError> => {
      const id = deps.idGen.next("s") as SessionId
      const startedAt = deps.clock.now().toISOString()
      const written = db.run(INSERT_SESSION, [id, input.harnessId, input.alias, startedAt])
      if (isErr(written)) return written
      return ok({ id, harnessId: input.harnessId, alias: input.alias, startedAt })
    },
```

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add SessionStore.create with parameterized INSERT [sessions-03]`.

---

### Task sessions-04: close (parameterized UPDATE; not-found when missing)

**Files:**
- Edit: `packages/sessions/src/store.ts`
- Test: `packages/sessions/src/store.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `store.test.ts`:

```typescript
describe("createSessionStore.close", () => {
  it("returns the updated Session with endedAt and exitCode when close() is called on an open session", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    const created = store.create({ harnessId: "claude" as never, alias: "default" as never })
    const id = isOk(created) ? created.value.id : ("" as never)
    const r = store.close(id, 0)
    expect(isOk(r) && r.value).toEqual({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:00:00.000Z",
      exitCode: 0,
    })
  })

  it("issues a parameterized UPDATE whose id is bound in params, not interpolated, when close() is called", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    const created = store.create({ harnessId: "claude" as never, alias: "default" as never })
    const id = isOk(created) ? created.value.id : ("" as never)
    store.close(id, 137)
    const update = deps.db.statements().find((s) => /^\s*UPDATE/i.test(s.sql))
    expect(update?.sql).toContain("?")
    expect(update?.sql).toMatch(/WHERE id = \?/i)
    expect(update?.sql).not.toContain("s_1")
    expect(update?.params).toEqual(["2026-05-23T10:00:00.000Z", 137, "s_1"])
  })

  it("returns a not-found error when close() targets an id that has no row", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    const r = store.close("s_missing" as never, 0)
    expect(r).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("returns the db-failed error when the UPDATE fails", () => {
    const failing = {
      ...makeDeps(),
      db: {
        exec: () => ({ ok: true as const, value: undefined }),
        run: () => ({ ok: false as const, error: { kind: "db-failed" as const, detail: "locked" } }),
        all: () => ({ ok: true as const, value: [] }),
        get: () => ({ ok: true as const, value: undefined }),
      },
    }
    const store = createSessionStore(failing)
    const r = store.close("s_1" as never, 0)
    expect(r).toEqual({ ok: false, error: { kind: "db-failed", detail: "locked" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (`close` throws "not implemented").

- [ ] **Step 3: Implement** — in `store.ts`, add the SQL constants and a row→Session mapper near the other constants:

```typescript
const UPDATE_CLOSE = "UPDATE sessions SET endedAt = ?, exitCode = ? WHERE id = ?"
const SELECT_BY_ID = "SELECT id, harnessId, alias, startedAt, endedAt, exitCode FROM sessions WHERE id = ?"

/** Map a raw sqlite row into a Session, dropping NULL endedAt/exitCode. */
const toSession = (row: Record<string, unknown>): Session => {
  const base: Session = {
    id: row["id"] as SessionId,
    harnessId: row["harnessId"] as HarnessId,
    alias: row["alias"] as AliasName,
    startedAt: String(row["startedAt"]),
  }
  const endedAt = row["endedAt"]
  const exitCode = row["exitCode"]
  return {
    ...base,
    ...(typeof endedAt === "string" ? { endedAt } : {}),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
  }
}
```

Then replace the placeholder `close` in the returned object:

```typescript
    close: (id: SessionId, exitCode: number): Result<Session, SessionError> => {
      const endedAt = deps.clock.now().toISOString()
      const written = db.run(UPDATE_CLOSE, [endedAt, exitCode, id])
      if (isErr(written)) return written
      const fetched = db.get(SELECT_BY_ID, [id])
      if (isErr(fetched)) return fetched
      if (fetched.value === undefined) return err({ kind: "not-found" })
      return ok(toSession(fetched.value))
    },
```

Update the imports at the top of `store.ts` to add `err` (and keep the existing names):

```typescript
import { type Result, ok, err, isErr, type Clock, type IdGen } from "@launchkit/utils"
```
> `close` re-reads the row via `SELECT_BY_ID` after the `UPDATE` so the returned `Session` reflects what is actually persisted, and so a missing row surfaces as `not-found` regardless of whether the driver reports affected-row counts.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add SessionStore.close with parameterized UPDATE [sessions-04]`.

---

### Task sessions-05: query (parameterized WHERE, ordered startedAt desc)

**Files:**
- Edit: `packages/sessions/src/store.ts`
- Test: `packages/sessions/src/store.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `store.test.ts`:

```typescript
describe("createSessionStore.query", () => {
  it("returns every session ordered by startedAt descending when query() is called without a filter", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    deps.db.run("INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)", [
      "s_old", "claude", "default", "2026-05-23T09:00:00.000Z",
    ])
    deps.db.run("INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)", [
      "s_new", "codex", "fast", "2026-05-23T11:00:00.000Z",
    ])
    const r = store.query()
    expect(isOk(r) && r.value.map((s) => s.id)).toEqual(["s_new", "s_old"])
  })

  it("issues a SELECT with no WHERE clause when query() is called without a filter", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    store.query()
    const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
    expect(select?.sql).not.toMatch(/WHERE/i)
    expect(select?.sql).toMatch(/ORDER BY startedAt DESC/i)
    expect(select?.params).toEqual([])
  })

  it("builds a parameterized WHERE binding the harnessId in params when query() filters by harnessId", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    store.query({ harnessId: "claude" as never })
    const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
    expect(select?.sql).toMatch(/WHERE harnessId = \?/i)
    expect(select?.sql).not.toContain("claude")
    expect(select?.params).toEqual(["claude"])
  })

  it("combines harnessId, alias and since with AND and binds all three values when query() filters by all", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    store.query({ harnessId: "claude" as never, alias: "default" as never, since: "2026-05-23T00:00:00.000Z" })
    const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
    expect(select?.sql).toMatch(/WHERE harnessId = \? AND alias = \? AND startedAt >= \?/i)
    expect(select?.params).toEqual(["claude", "default", "2026-05-23T00:00:00.000Z"])
  })

  it("never interpolates any filter value into the SELECT sql when query() filters", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    store.query({ harnessId: "claude" as never, alias: "default" as never, since: "2026-05-23T00:00:00.000Z" })
    const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
    expect(select?.sql).not.toContain("claude")
    expect(select?.sql).not.toContain("default")
    expect(select?.sql).not.toContain("2026-05-23T00:00:00.000Z")
  })

  it("returns only sessions at or after the since bound when query() filters by since", () => {
    const deps = makeDeps()
    const store = createSessionStore(deps)
    store.init()
    deps.db.run("INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)", [
      "s_old", "claude", "default", "2026-05-23T08:00:00.000Z",
    ])
    deps.db.run("INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)", [
      "s_new", "claude", "default", "2026-05-23T12:00:00.000Z",
    ])
    const r = store.query({ since: "2026-05-23T10:00:00.000Z" })
    expect(isOk(r) && r.value.map((s) => s.id)).toEqual(["s_new"])
  })

  it("returns the db-failed error when the SELECT fails", () => {
    const failing = {
      ...makeDeps(),
      db: {
        exec: () => ({ ok: true as const, value: undefined }),
        run: () => ({ ok: true as const, value: undefined }),
        all: () => ({ ok: false as const, error: { kind: "db-failed" as const, detail: "io" } }),
        get: () => ({ ok: true as const, value: undefined }),
      },
    }
    const store = createSessionStore(failing)
    const r = store.query({ harnessId: "claude" as never })
    expect(r).toEqual({ ok: false, error: { kind: "db-failed", detail: "io" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (`query` throws "not implemented").

- [ ] **Step 3: Implement** — in `store.ts`, add a column list constant and a pure WHERE builder near the other constants:

```typescript
const SELECT_COLUMNS = "SELECT id, harnessId, alias, startedAt, endedAt, exitCode FROM sessions"

/** Build a parameterized WHERE from a filter: column names go in the sql, values go in params. */
const buildWhere = (
  filter: SessionFilter,
): { readonly clause: string; readonly params: readonly unknown[] } => {
  const conditions: string[] = []
  const params: unknown[] = []
  if (filter.harnessId !== undefined) {
    conditions.push("harnessId = ?")
    params.push(filter.harnessId)
  }
  if (filter.alias !== undefined) {
    conditions.push("alias = ?")
    params.push(filter.alias)
  }
  if (filter.since !== undefined) {
    conditions.push("startedAt >= ?")
    params.push(filter.since)
  }
  const clause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : ""
  return { clause, params }
}
```

Then replace the placeholder `query` in the returned object:

```typescript
    query: (filter?: SessionFilter): Result<readonly Session[], SessionError> => {
      const { clause, params } = buildWhere(filter ?? {})
      const sql = `${SELECT_COLUMNS}${clause} ORDER BY startedAt DESC`
      const rows = db.all(sql, params)
      if (isErr(rows)) return rows
      return ok(rows.value.map(toSession))
    },
```
> Column names are concatenated (they are fixed identifiers, never user data); only *values* flow through `params`. The five `query` tests assert no filter value ever appears in the SQL string — this is the `security.md` "parameterized statements only" gate.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add SessionStore.query with parameterized WHERE [sessions-05]`.

---

### Task sessions-06: createBunSqliteDatabase + real-driver integration round-trip

**Files:**
- Create: `packages/sessions/src/bun-sqlite.ts`
- Test: `packages/sessions/src/bun-sqlite.integration.test.ts`

- [ ] **Step 1: Write the failing test** — an integration test on `:memory:` exercising the real driver end-to-end through the store:

```typescript
import { describe, it, expect } from "bun:test"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
import { createSessionStore } from "./store"
import { createBunSqliteDatabase } from "./bun-sqlite"

describe("createBunSqliteDatabase + SessionStore", () => {
  it("round-trips init -> create -> close -> query against real bun:sqlite when run end-to-end", () => {
    const db = createBunSqliteDatabase(":memory:")
    const clock = createFixedClock(new Date("2026-05-23T10:00:00.000Z"))
    const idGen = createSequentialIdGen()
    const store = createSessionStore({ db, clock, idGen })

    expect(isOk(store.init())).toBe(true)

    const created = store.create({ harnessId: "claude" as never, alias: "default" as never })
    expect(isOk(created) && created.value).toEqual({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
    })

    const closed = store.close("s_1" as never, 0)
    expect(isOk(closed) && closed.value).toEqual({
      id: "s_1",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:00:00.000Z",
      exitCode: 0,
    })

    const all = store.query()
    expect(isOk(all) && all.value.map((s) => s.id)).toEqual(["s_1"])
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
    expect(isOk(r) && r.value.map((s) => s.harnessId)).toEqual(["codex"])
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (module `./bun-sqlite` not found).

- [ ] **Step 3: Implement `bun-sqlite.ts`** — wrap `bun:sqlite`, reuse prepared statements, bind every value, and convert any thrown driver error into a `db-failed` `Result`:

```typescript
import { Database as BunDatabase, type Statement } from "bun:sqlite"
import { type Result, ok, err } from "@launchkit/utils"
import type { Database, SessionError } from "./db"

const detailOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Real sqlite adapter. Prepared statements are created once per distinct SQL string and
 * reused (performance.md), and every value is bound via params (security.md) — never interpolated.
 */
export const createBunSqliteDatabase = (path: string): Database => {
  const conn = new BunDatabase(path)
  const prepared = new Map<string, Statement>()

  const prepare = (sql: string): Statement => {
    const existing = prepared.get(sql)
    if (existing !== undefined) return existing
    const stmt = conn.prepare(sql)
    prepared.set(sql, stmt)
    return stmt
  }

  return {
    exec: (sql: string): Result<void, SessionError> => {
      try {
        conn.exec(sql)
        return ok(undefined)
      } catch (cause) {
        return err({ kind: "db-failed", detail: detailOf(cause) })
      }
    },

    run: (sql: string, params: readonly unknown[]): Result<void, SessionError> => {
      try {
        prepare(sql).run(...(params as unknown[]))
        return ok(undefined)
      } catch (cause) {
        return err({ kind: "db-failed", detail: detailOf(cause) })
      }
    },

    all: (sql: string, params: readonly unknown[]): Result<readonly Record<string, unknown>[], SessionError> => {
      try {
        const rows = prepare(sql).all(...(params as unknown[])) as Record<string, unknown>[]
        return ok(rows)
      } catch (cause) {
        return err({ kind: "db-failed", detail: detailOf(cause) })
      }
    },

    get: (sql: string, params: readonly unknown[]): Result<Record<string, unknown> | undefined, SessionError> => {
      try {
        const row = prepare(sql).get(...(params as unknown[])) as Record<string, unknown> | null
        return ok(row ?? undefined)
      } catch (cause) {
        return err({ kind: "db-failed", detail: detailOf(cause) })
      }
    },
  }
}
```
> `try/catch` here is the **boundary** translation of the driver's exceptions into typed `Result` values — the rest of the package stays exception-free. The `params as unknown[]` cast only widens `readonly` for the variadic `bun:sqlite` signature; values are still bound, never interpolated.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(sessions): add real bun:sqlite adapter + integration round-trip [sessions-06]`.

---

### Task sessions-07: Barrel + package CLAUDE.md

**Files:**
- Create: `packages/sessions/src/index.ts`, `packages/sessions/CLAUDE.md`
- Test: `packages/sessions/src/index.test.ts`

- [ ] **Step 1: Write the failing test** asserting the public surface re-exports the store, both adapters, and the error/value types:

```typescript
import { describe, it, expect } from "bun:test"
import { isOk, createFixedClock, createSequentialIdGen } from "@launchkit/utils"
import * as sessions from "./index"
import { createSessionStore, createInMemoryDatabase } from "./index"

describe("@launchkit/sessions barrel", () => {
  it("exports createSessionStore, createInMemoryDatabase and createBunSqliteDatabase when imported", () => {
    for (const name of ["createSessionStore", "createInMemoryDatabase", "createBunSqliteDatabase"]) {
      expect(sessions).toHaveProperty(name)
      expect(typeof (sessions as Record<string, unknown>)[name]).toBe("function")
    }
  })

  it("round-trips through the public surface alone when create then query are called", () => {
    const store = createSessionStore({
      db: createInMemoryDatabase(),
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    store.create({ harnessId: "claude" as never, alias: "default" as never })
    const r = store.query()
    expect(isOk(r) && r.value.length).toBe(1)
  })
})
```
> Importing both the namespace (`* as sessions`, for the property check) and the named symbols (for the round-trip) from `./index` keeps the second test plain and synchronous.

- [ ] **Step 2: Run, expect RED** — `bun test packages/sessions` → FAIL (module `./index` not found).

- [ ] **Step 3: Implement `index.ts`**

```typescript
export type { Database, SessionError, RecordedStatement, InMemoryDatabase } from "./db"
export { createInMemoryDatabase } from "./db"
export type { SessionStore, SessionInput, SessionFilter } from "./store"
export { createSessionStore } from "./store"
export { createBunSqliteDatabase } from "./bun-sqlite"
```
> Type-only symbols are re-exported with `export type` to satisfy `verbatimModuleSyntax`. `Session`/`SessionId`/`HarnessId`/`AliasName` are **not** re-exported here — consumers import those from `@launchkit/types` (single source of truth).

- [ ] **Step 4: Create `packages/sessions/CLAUDE.md`** from the `sessions` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# @launchkit/sessions

**Responsibility:** Session history — persist each launched harness instance (harness, alias, timestamps, exit code) in SQLite.

**Public API (barrel `src/index.ts`):** `SessionStore` interface + `createSessionStore({ db, clock, idGen })`; the `Database` effect interface + `createInMemoryDatabase()` (recording fake) + `createBunSqliteDatabase(path)` (real adapter); `SessionInput`, `SessionFilter`, `SessionError`.

**Depends on:** `@launchkit/types`, `@launchkit/utils` (see build-plan/02-monorepo/boundaries.md).

**Effects owned:** sqlite (via the injected `Database` interface; the real adapter wraps `bun:sqlite`)
— exposed to consumers as an injected interface; never reached around.

**Local rules:** Parameterized statements only — values go in the `params` array, never interpolated into the SQL string (a test asserts this for every statement). Index `startedAt` and `harnessId`. The real adapter reuses prepared statements. `Session` and the branded ids come from `@launchkit/types`; do not redefine or re-export them here.
```

- [ ] **Step 5: GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(sessions): add public barrel + CLAUDE.md [sessions-07]`.

**End state:** `@launchkit/sessions` exports a `SessionStore` (`init`/`create`/`close`/`query`) built as pure logic over an injected `Database` effect. Unit tests run against `createInMemoryDatabase`, a recording fake that captures `{ sql, params }` and proves every statement is parameterized; one `*.integration.test.ts` exercises the real `createBunSqliteDatabase` on `:memory:` for a full init→create→close→query round-trip. The schema indexes `startedAt` and `harnessId`, the real adapter reuses prepared statements, and all failures are returned as `Result<T, SessionError>` rather than thrown. Consumers `import { createSessionStore, createBunSqliteDatabase, type SessionStore } from "@launchkit/sessions"` and inject a `Clock`/`IdGen` from `@launchkit/utils`.
