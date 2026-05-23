# @launchkit/utils Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the pure cross-cutting primitives every package depends on: the `Result<T,E>` type + combinators, `pipe`/`flow`, `renderTemplate`, `redactSecrets`, and the shared effect interfaces `Clock` and `IdGen` (with real adapters + in-memory fakes).

**Architecture:** Everything here is either pure or a small effect *interface* + adapter. No concrete IO logic lives in feature packages without an interface defined here first. This is the toolbox that makes the functional style in `01-conventions/functional-style.md` possible.

**Tech Stack:** TypeScript (strict), `bun:test`. No external runtime deps (uses `crypto.randomUUID`).

> Depends on: `types` (only for branded-id-aware helpers if needed; otherwise none). Read `01-conventions/functional-style.md`.
> Create the package via `launchkit-new-package`: `packages/utils`.

---

### Task utils-01: Result core (`ok`/`err`/`isOk`/`isErr`)

**Files:** Create `packages/utils/src/result.ts`; Test `result.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ok, err, isOk, isErr } from "./result"

describe("Result constructors", () => {
  it("creates an Ok carrying the value when ok() is called", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 })
  })
  it("creates an Err carrying the error when err() is called", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" })
  })
  it("narrows to Ok when isOk() is true", () => {
    const r = ok(1)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value).toBe(1)
  })
  it("narrows to Err when isErr() is true", () => {
    const r = err("e")
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error).toBe("e")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement `result.ts`**

```typescript
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add Result core [utils-01]`.

---

### Task utils-02: Result combinators

**Files:** Create `packages/utils/src/result-combinators.ts`; Test `result-combinators.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ok, err } from "./result"
import { map, mapErr, andThen, unwrapOr } from "./result-combinators"

describe("map", () => {
  it("transforms the value when the result is Ok", () => {
    expect(map(ok(2), (n: number) => n * 3)).toEqual(ok(6))
  })
  it("passes the error through unchanged when the result is Err", () => {
    expect(map(err("e"), (n: number) => n * 3)).toEqual(err("e"))
  })
})
describe("andThen", () => {
  it("chains into the next Result when Ok", () => {
    expect(andThen(ok(2), (n: number) => ok(n + 1))).toEqual(ok(3))
  })
  it("short-circuits when Err", () => {
    expect(andThen(err("e"), (n: number) => ok(n + 1))).toEqual(err("e"))
  })
})
describe("mapErr", () => {
  it("transforms the error when Err", () => {
    expect(mapErr(err("e"), (s: string) => s.toUpperCase())).toEqual(err("E"))
  })
})
describe("unwrapOr", () => {
  it("returns the value when Ok and the fallback when Err", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1)
    expect(unwrapOr(err("e"), 99)).toBe(99)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import { type Result, ok, err, isOk } from "./result"

export const map = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  isOk(r) ? ok(f(r.value)) : r

export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> =>
  isOk(r) ? r : err(f(r.error))

export const andThen = <T, U, E>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> =>
  isOk(r) ? f(r.value) : r

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  isOk(r) ? r.value : fallback
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add Result combinators [utils-02]`.

---

### Task utils-03: `pipe` & `flow`

**Files:** Create `packages/utils/src/compose.ts`; Test `compose.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { pipe, flow } from "./compose"

const inc = (n: number): number => n + 1
const double = (n: number): number => n * 2

describe("pipe", () => {
  it("threads a value left-to-right through the functions", () => {
    expect(pipe(3, inc, double)).toBe(8)
  })
})
describe("flow", () => {
  it("composes functions into a single left-to-right function", () => {
    expect(flow(inc, double)(3)).toBe(8)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (provide typed overloads up to a reasonable arity — 6 — then a variadic fallback)

```typescript
export function pipe<A>(a: A): A
export function pipe<A, B>(a: A, ab: (a: A) => B): B
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D
export function pipe(a: unknown, ...fns: ReadonlyArray<(x: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), a)
}

export function flow<A, B>(ab: (a: A) => B): (a: A) => B
export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C
export function flow<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D
export function flow(...fns: ReadonlyArray<(x: unknown) => unknown>): (a: unknown) => unknown {
  return (a) => fns.reduce((acc, fn) => fn(acc), a)
}
```
> Extend overloads to arity 6 for both. The variadic implementation is the runtime; the overloads provide the types.

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add pipe + flow [utils-03]`.

---

### Task utils-04: `renderTemplate`

**Files:** Create `packages/utils/src/template.ts`; Test `template.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { renderTemplate } from "./template"

describe("renderTemplate", () => {
  it("replaces every {{token}} with the matching variable when all are provided", () => {
    const r = renderTemplate("{{proxyUrl}}/v1 key={{proxyKey}}", { proxyUrl: "http://localhost:4000", proxyKey: "abc" })
    expect(r).toEqual({ ok: true, value: "http://localhost:4000/v1 key=abc" })
  })
  it("returns an unknown-token error when a placeholder has no variable", () => {
    const r = renderTemplate("hi {{missing}}", { name: "x" })
    expect(r).toEqual({ ok: false, error: { kind: "unknown-token", token: "missing" } })
  })
  it("leaves text without placeholders unchanged", () => {
    expect(renderTemplate("plain", {})).toEqual({ ok: true, value: "plain" })
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import { type Result, ok, err } from "./result"

export type TemplateError = { readonly kind: "unknown-token"; readonly token: string }

const TOKEN = /\{\{(\w+)\}\}/g

export const renderTemplate = (
  template: string,
  vars: Readonly<Record<string, string>>,
): Result<string, TemplateError> => {
  let unknown: string | undefined
  const out = template.replace(TOKEN, (_match, token: string) => {
    const value = vars[token]
    if (value === undefined) { unknown ??= token; return _match }
    return value
  })
  return unknown === undefined ? ok(out) : err({ kind: "unknown-token", token: unknown })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add renderTemplate [utils-04]`.

---

### Task utils-05: `redactSecrets`

**Files:** Create `packages/utils/src/redact.ts`; Test `redact.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { redactSecrets } from "./redact"

describe("redactSecrets", () => {
  it("replaces each known secret value with [REDACTED] when present in the text", () => {
    expect(redactSecrets("auth=sk-12345 done", ["sk-12345"])).toBe("auth=[REDACTED] done")
  })
  it("redacts every occurrence of a secret", () => {
    expect(redactSecrets("a sk a sk", ["sk"])).toBe("a [REDACTED] a [REDACTED]")
  })
  it("returns the text unchanged when no secrets are provided", () => {
    expect(redactSecrets("nothing here", [])).toBe("nothing here")
  })
  it("ignores empty-string secrets to avoid redacting everything", () => {
    expect(redactSecrets("keep", [""])).toBe("keep")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const redactSecrets = (text: string, secrets: readonly string[]): string =>
  secrets
    .filter((s) => s.length > 0)
    .reduce((acc, secret) => acc.replaceAll(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]"), text)
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add redactSecrets [utils-05]`.

---

### Task utils-06: `Clock` & `IdGen` effect interfaces + adapters

**Files:** Create `packages/utils/src/clock.ts`, `packages/utils/src/id.ts`; Test `clock.test.ts`, `id.test.ts`.

- [ ] **Step 1: Failing tests**

`clock.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { createSystemClock, createFixedClock } from "./clock"

describe("createFixedClock", () => {
  it("returns the configured instant whenever now() is called", () => {
    const clock = createFixedClock(new Date("2026-05-23T00:00:00.000Z"))
    expect(clock.now().toISOString()).toBe("2026-05-23T00:00:00.000Z")
  })
})
describe("createSystemClock", () => {
  it("returns a Date close to the real time when now() is called", () => {
    const before = Date.now()
    const t = createSystemClock().now().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
  })
})
```

`id.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { createSequentialIdGen, createCryptoIdGen } from "./id"

describe("createSequentialIdGen", () => {
  it("produces deterministic prefixed ids when called repeatedly", () => {
    const gen = createSequentialIdGen()
    expect(gen.next("p")).toBe("p_1")
    expect(gen.next("p")).toBe("p_2")
  })
})
describe("createCryptoIdGen", () => {
  it("produces a unique prefixed id each time next() is called", () => {
    const gen = createCryptoIdGen()
    expect(gen.next("s")).not.toBe(gen.next("s"))
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement `clock.ts`**

```typescript
export interface Clock { now(): Date }

export const createSystemClock = (): Clock => ({ now: () => new Date() })

export const createFixedClock = (instant: Date): Clock => ({ now: () => new Date(instant) })
```

`id.ts`:
```typescript
export interface IdGen { next(prefix: string): string }

export const createCryptoIdGen = (): IdGen => ({
  next: (prefix) => `${prefix}_${crypto.randomUUID()}`,
})

export const createSequentialIdGen = (): IdGen => {
  let n = 0
  return { next: (prefix) => `${prefix}_${++n}` }
}
```
> `createSequentialIdGen` is the test fake; `createCryptoIdGen` is production. Both satisfy `IdGen`, so packages inject whichever.

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(utils): add Clock + IdGen interfaces and adapters [utils-06]`.

---

### Task utils-07: Barrel + CLAUDE.md

**Files:** Create `packages/utils/src/index.ts`, `packages/utils/CLAUDE.md`; Test `index.test.ts`.

- [ ] **Step 1: Failing test** asserting the barrel re-exports `ok`, `err`, `map`, `andThen`, `pipe`, `flow`, `renderTemplate`, `redactSecrets`, `createSystemClock`, `createCryptoIdGen` (check each is defined).

- [ ] **Step 2: RED. Step 3: Implement `index.ts`**

```typescript
export * from "./result"
export * from "./result-combinators"
export * from "./compose"
export * from "./template"
export * from "./redact"
export * from "./clock"
export * from "./id"
```

- [ ] **Step 4: Create `packages/utils/CLAUDE.md`** from the `utils` entry in `package-claude-md.md`.

- [ ] **Step 5: GREEN + full gate. Step 6: Update PROGRESS.md, commit** `feat(utils): add public barrel + CLAUDE.md [utils-07]`.

**End state:** `@launchkit/utils` exports `Result` + combinators, composition, `renderTemplate`, `redactSecrets`, and the `Clock`/`IdGen` interfaces with real + fake adapters. Downstream packages import effects as interfaces from here and inject fakes in tests.
