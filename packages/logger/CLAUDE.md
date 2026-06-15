# @spectrum/logger

**Responsibility:** Structured, injectable logging. A pure `Logger` (`debug/info/warn/error/fatal` + `child` scopes) built by `createLogger`, fanning `LogRecord`s out to injected `Sink`s (console, rotating file). Logging is fire-and-forget and infallible — methods return void and never throw.

**Public API (barrel `src/index.ts`):** `LogLevel`, `LogRecord`, `Logger`, `Sink`; `createLogger`, `createNoopLogger`; `createConsoleSink`; `createRotatingFileSink`, `LogFileOps`, `createInMemoryLogFileOps`, `createFsLogFileOps`; `resolveMinLevel`.

**Depends on:** `@spectrum/utils` (`Clock`, `redactSecrets`).

**Effects owned:** filesystem (via the injected `LogFileOps`) and the console writer (injected) — never reached around. The only effectful module is `fs-file-ops.ts`.

**Local rules:** Logging NEVER throws and NEVER affects control flow — it is observation alongside `Result` returns, not a replacement. Records are filtered by `minLevel` and run through `redactSecrets` before any sink. Call sites must never pass raw secret values as fields (redaction is defense-in-depth). Pure-logic packages stay log-free; only effect/boundary/lifecycle code logs.
