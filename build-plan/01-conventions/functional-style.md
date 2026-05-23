# Convention — Functional style

**Pure functions, composed. Effects isolated. Errors as values. Functions as dumb as possible.**

## Core principles

1. **Pure by default.** A function's output depends only on its inputs; it mutates nothing observable. Pure functions are trivial to test and compose.
2. **One job per function.** If a function does two things ("validate *and* save"), split it. Compose the small pieces into the feature. A function you can't describe in one sentence is too big.
3. **Effects live at the edges.** Filesystem, network, `spawn`, `bun:sqlite`, the clock, randomness, and the keychain are **effects**. Pure logic never calls them directly — it receives them through small injected adapter interfaces.
4. **Errors are values.** Fallible operations return `Result<T, E>` (below), not exceptions. Throwing is reserved for unrecoverable programmer errors (failed invariants), never for expected failures like "file missing" or "network error".
5. **Immutability.** Inputs are `readonly`; produce new values rather than mutating.

## The `Result` type (lives in `@launchkit/utils`)

The authoritative definition is pinned in [`../04-plans/02-utils.md`](../04-plans/02-utils.md). Shape:

```typescript
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })
```

Helpers (`map`, `mapErr`, `andThen`, `unwrapOr`, `isOk`, `isErr`) are defined there too. Errors are **typed** discriminated unions per domain (e.g. `ConfigError = { kind: "not-found" } | { kind: "parse-failed"; detail: string }`), never bare strings or `Error`.

## Effect isolation pattern (the most important rule)

Define a narrow interface for each effect; pass it in. Production wires the real adapter; tests pass an in-memory fake.

```typescript
// effect interface — the only thing the feature knows about the filesystem
export interface FileStore {
  read(path: string): Promise<Result<string, FileError>>
  write(path: string, contents: string): Promise<Result<void, FileError>>
}

// feature: pure logic + injected effect. No direct fs import.
export const loadConfig =
  (store: FileStore) =>
  async (path: string): Promise<Result<Config, ConfigError>> => {
    const raw = await store.read(path)
    if (!raw.ok) return err({ kind: "not-found" })
    return parseConfig(raw.value)   // parseConfig is pure
  }
```

Tests for `loadConfig` use an in-memory `FileStore` fake — no disk, fast, deterministic. A thin integration test exercises the **real** adapter separately.

## Composition

Build features by piping small functions. `@launchkit/utils` provides `pipe`/`flow`:

```typescript
const normalize = flow(trimWhitespace, toLowerCase, stripPrefix)
```

Prefer data-last functions and currying for the injected-dependency pattern shown above (`fn(deps)(args)`).

## What to avoid

- Classes with mutable internal state. Prefer a factory returning an object of functions closing over injected deps, or plain functions + a state value passed explicitly.
- Shared mutable module-level state. The one allowed exception is an explicit, documented memoization cache (e.g. the provider-factory cache) — and even that is created by a factory, not a global.
- Throwing for control flow.
- "Manager" god-objects. Decompose by responsibility.
