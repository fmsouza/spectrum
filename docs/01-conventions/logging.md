# Logging convention

Spectrum logs through one structured, **injectable** `Logger` (`@spectrum/logger`). Logging is
*observation*: it records what happened at effect/lifecycle boundaries — it never throws and never
influences control flow. Control flow is the `Result<T, E>` a function returns; the log line sits
*alongside* it.

This is the canonical rule. The per-package `CLAUDE.md` files (`@spectrum/logger`, `@spectrum/db`,
`@spectrum/secrets`, …) restate the local version; this doc is the source of truth.

## The `Logger` interface

```ts
export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  fatal(msg: string, fields?: Record<string, unknown>): void
  /** Bind a child scope (dotted) and/or default fields merged into every record. */
  child(scope: string, fields?: Record<string, unknown>): Logger
}
```

Every method returns `void` and never throws — a faulty sink is swallowed internally. `child`
binds a dotted scope (`"ipc"` → `log.child("deleteSession")` → scope `"ipc.deleteSession"`) plus
default fields merged into every record.

## The five levels — when to use each

| Level   | Use for                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------ |
| `debug` | Verbose/dev detail, hot-path traces. Filtered out in production (`minLevel: "info"`).            |
| `info`  | Lifecycle transitions — startup/shutdown, proxy start/stop, session/run start/stop.              |
| `warn`  | Recoverable / expected-but-notable failures — a best-effort secret delete that failed, client 4xx. |
| `error` | Unrecoverable operation failure **at a boundary** — db open/migrate, spawn, provider, handler failures. |
| `fatal` | Process-ending conditions.                                                                       |

The levels rank `debug < info < warn < error < fatal`; `createLogger`'s `minLevel` drops anything
below the threshold before it reaches a sink.

## Inject, don't import

A subsystem takes an **injected** `Logger`, defaulting to `createNoopLogger()`. It never constructs
a real logger and never reaches for a global. Only the composition root
(`apps/desktop/src/composition.ts`) builds the real logger and injects a `log.child("<scope>")` per
subsystem:

```ts
// composition root — the ONLY place a real logger is constructed
const log = createLogger({ sinks, clock, minLevel, redact })

const secrets = createSecretStore({ backend, idGen, logger: log.child("secrets") })
const dbOpen = createSqliteClient(dbFile, { logger: log.child("db") })
const runner = createRunManager({ /* … */ logger: log.child("runner") })
```

```ts
// a package — accepts the logger, defaults to noop, never imports a real one
export const createSqliteClient = (
  path: string,
  deps: { logger?: Logger } = {},
): Result<DbClient, DbError> => {
  const logger = deps.logger ?? createNoopLogger()
  // …
}
```

Scopes wired today: `db`, `secrets`, `config`, `harness`, `proxy`, `runner`, `reset`, plus
`cli`/`ipc`/`webview` at the shell. A package that is never given a logger logs nothing — tests stay
silent without any setup.

## Log at boundaries, not in pure logic

Log only at:

- **Effect boundaries** — fs, keychain, sqlite, spawn, http.
- **Lifecycle transitions** — startup/shutdown, proxy/session/run start/stop.
- **Handler errors** — an IPC handler or run-manager step that failed.

**Pure-logic packages stay log-free**: `@spectrum/types`, `@spectrum/agent-events`,
`@spectrum/providers`, `@spectrum/platform`, `@spectrum/ui`, `@spectrum/brand` take no logger and
emit nothing. There is nothing to observe in a pure function — its inputs and output are its
contract.

Logging is observation, **not** control flow: emit the line *and still return the same `Result`*.
Never branch on whether a log call "succeeded" (it returns `void`), and never let it throw.

On a hot streaming / per-chunk path, never log above `debug` — an `info` per chunk would flood the
file and stall the stream.

## Redaction and security

Never pass a raw secret as a field or a message: not an `apiKey`, not the per-run proxy key, not a
`SecretRef`, not secret-bearing CLI output (an error `detail` can echo it). The `redact` hook in
`createLogger` is **defense-in-depth**, not a license to log secrets — call sites must already be
clean.

Log non-sensitive identifiers and kinds only: a `sessionId`, a `harnessId`, an `op` label, an error
`kind` enum. The keychain store is the canonical example — it logs `{ op, kind }` and nothing else:

```ts
// @spectrum/secrets — observe a backend failure with the op label + kind enum ONLY
logger.warn("keychain op failed", { op, kind: result.error.kind })
// NEVER: logger.warn("keychain op failed", { value, ref, detail })
```

The proxy logs lifecycle and request *shape*, never the key it was started with. When in doubt, log
`{ op, kind }`, never the secret/ref/value.

## The rotating file location

Production writes structured **JSON-lines** to `dataDir/logs/spectrum.log`, rotating at **5 MB × 3
files** (`spectrum.log` → `.1` → `.2`, dropping the oldest). Development adds a **pretty** console
sink (`HH:MM:SS LEVEL [scope] msg k=v …`) on top, and runs against a separate dev data dir so dev
noise never lands in production logs.

`minLevel` is resolved at startup by `resolveMinLevel(appEnv, env)`:

- `debug` in development,
- `info` in production,
- overridden by a valid `SPECTRUM_LOG_LEVEL` env var (`debug`/`info`/`warn`/`error`/`fatal`).

## Do / don't

**DO** — log the failure at the boundary, then return the same `Result`:

```ts
} catch (cause) {
  const detail = detailOf(cause)
  logger.error("sqlite open failed", { detail }) // observation only
  return err({ kind: "open-failed", detail })    // the control-flow signal
}
```

**DO** — accept an injected logger, default to noop, and let the composition root scope it:

```ts
// package
export const createThing = (deps: { logger?: Logger }) => {
  const logger = deps.logger ?? createNoopLogger()
  // …
}
// composition root
const thing = createThing({ logger: log.child("thing") })
```

**DON'T** — reach for `console.*` in `src` (a biome `noConsole` rule rejects it; `scripts/**` and
`*.test.*` are exempt):

```ts
console.error("sqlite open failed", cause) // ✗ use the injected logger
```

**DON'T** — log a secret value, ref, or detail-that-echoes-a-secret:

```ts
logger.info("provider configured", { apiKey })  // ✗ raw secret
logger.warn("delete failed", { ref, detail })    // ✗ ref + leak-prone detail
```

**DON'T** — log per-chunk above `debug`, or treat a log call as control flow:

```ts
for (const chunk of stream) logger.info("chunk", { chunk }) // ✗ floods the stream
if (logger.error("x")) { /* … */ }                          // ✗ returns void; never branches
```

## TODO / related

This file establishes `docs/01-conventions/`. The sibling conventions referenced by
`@spectrum/ui`'s `CLAUDE.md` — `atomic-design.md` and `performance.md` — do not exist yet and remain
to be backfilled (out of scope here).
