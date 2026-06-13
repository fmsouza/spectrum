# @spectrum/sessions

**Responsibility:** Session history — persist each launched harness instance (harness, optional modelId, timestamps, exit code) via the @spectrum/db SQLite layer.

**Public API (barrel `src/index.ts`):** `SessionStore` interface + `createSessionStore({ db, clock, idGen })`; `SessionInput`, `SessionFilter`, `SessionError`.

**Depends on:** `@spectrum/db`, `@spectrum/types`, `@spectrum/utils`

**Effects owned:** none directly — sqlite is reached through the injected `DbClient` from `@spectrum/db`. The store builds queries with Drizzle and crosses the boundary through `tryDb`, returning `Result<T, SessionError>`.

**Local rules:** Schema and migrations live in `@spectrum/db`; this package never issues DDL. `Session` and branded ids come from `@spectrum/types`.
