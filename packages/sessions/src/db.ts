import { type Result, ok } from "@launchkit/utils"

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
  all(
    sql: string,
    params: readonly unknown[],
  ): Result<readonly Record<string, unknown>[], SessionError>
  get(
    sql: string,
    params: readonly unknown[],
  ): Result<Record<string, unknown> | undefined, SessionError>
}

/** A statement captured by the in-memory fake so tests can assert parameterization. */
export type RecordedStatement = {
  readonly sql: string
  readonly params: readonly unknown[]
}

/** Test-only recording fake. Captures every {sql, params} and minimally interprets the store's statements. */
export interface InMemoryDatabase extends Database {
  statements(): readonly RecordedStatement[]
}

type Row = Record<string, unknown>

const firstKeyword = (sql: string): string =>
  (sql.trim().split(/\s+/, 1)[0] ?? "").toUpperCase()

/** Parse the `(a, b, c)` column list of an INSERT. */
const parseInsertColumns = (sql: string): readonly string[] => {
  const match = /\(([^)]*)\)\s*VALUES/i.exec(sql)
  if (match === null || match[1] === undefined) return []
  return match[1]
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
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

/** A WHERE predicate parsed from the SQL clause. */
type WhereTerm =
  | { readonly column: string; readonly op: "=" | ">=" }
  | { readonly column: string; readonly op: "IS NULL" }
  | { readonly column: string; readonly op: "IS NOT NULL" }

/** Parse `WHERE x = ? AND y >= ? AND z IS NULL` into ordered terms; returns [] when there is no WHERE. */
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
      const isNull = /^(\w+)\s+IS\s+NULL$/i.exec(clause.trim())
      if (isNull !== null && isNull[1] !== undefined)
        return { column: isNull[1], op: "IS NULL" }
      const isNotNull = /^(\w+)\s+IS\s+NOT\s+NULL$/i.exec(clause.trim())
      if (isNotNull !== null && isNotNull[1] !== undefined)
        return { column: isNotNull[1], op: "IS NOT NULL" }
      return undefined
    })
    .filter((t): t is WhereTerm => t !== undefined)
}

/** Consume one positional param per `=`/`>=` term; `IS NULL`/`IS NOT NULL` terms have no param. */
const matchesWhere = (
  row: Row,
  terms: readonly WhereTerm[],
  params: readonly unknown[],
): boolean => {
  let paramIdx = 0
  return terms.every((term) => {
    if (term.op === "IS NULL") return row[term.column] == null
    if (term.op === "IS NOT NULL") return row[term.column] != null
    const value = params[paramIdx++]
    const cell = row[term.column]
    if (term.op === ">=")
      return (
        typeof cell === "string" && typeof value === "string" && cell >= value
      )
    return cell === value
  })
}

const compareDesc = (a: Row, b: Row): number => {
  const av = typeof a.startedAt === "string" ? (a.startedAt as string) : ""
  const bv = typeof b.startedAt === "string" ? (b.startedAt as string) : ""
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
        const id = row.id
        if (typeof id === "string") rows.set(id, row)
        return ok(undefined)
      }
      if (keyword === "UPDATE") {
        const columns = parseUpdateColumns(sql)
        const whereTerms = parseWhereTerms(sql)
        // Count how many SET params there are (one per column in SET clause).
        const setParamCount = columns.length
        const setParams = params.slice(0, setParamCount)
        const whereParams = params.slice(setParamCount)
        // If the WHERE clause uses parameterized columns (`id = ?`), apply to a single row.
        // If the WHERE clause is param-free (e.g. `endedAt IS NULL`), apply to all matching rows.
        const matchingIds = [...rows.keys()].filter((id) => {
          const row = rows.get(id)
          return row !== undefined && matchesWhere(row, whereTerms, whereParams)
        })
        for (const id of matchingIds) {
          const existing = rows.get(id)
          if (existing === undefined) continue
          const next: Row = { ...existing }
          columns.forEach((col, i) => {
            next[col] = setParams[i]
          })
          rows.set(id, next)
        }
        return ok(undefined)
      }
      return ok(undefined)
    },

    all: (sql, params) => {
      record(sql, params)
      const terms = parseWhereTerms(sql)
      const matched = [...rows.values()].filter((row) =>
        matchesWhere(row, terms, params),
      )
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
