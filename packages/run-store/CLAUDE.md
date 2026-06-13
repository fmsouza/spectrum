# @spectrum/run-store

**Responsibility:** Append-only persistence + ordered read/replay of canonical run events. The structured analog of pty `scrollback-store` (raw bytes → file): here structured rows → SQLite via the @spectrum/db layer.

**Public API (barrel `src/index.ts`):** `RunStore` interface + `createRunStore({ db, clock })`; `RunStoreError`.

**Depends on:** `@spectrum/agent-events`, `@spectrum/db`, `@spectrum/types`, `@spectrum/utils`.

**Effects owned:** none directly — sqlite is reached through the injected `DbClient`. Every Drizzle call crosses the boundary through `tryDb`, returning `Result<T, RunStoreError>`.

**Local rules:** Schema and migrations live in `@spectrum/db` (`run_events`); this package never issues DDL. `append` computes `seq = (max(seq) for sessionId) + 1`, stamps `ts = clock.now().toISOString()`, and inserts `payload = JSON.stringify(event)`. `read` returns ordered `StoredEvent[]` (`seq ASC`, `JSON.parse(payload)`). `RunStore` structurally satisfies the `RunEventSink` port (agent-driver) so apps/desktop injects it directly.
