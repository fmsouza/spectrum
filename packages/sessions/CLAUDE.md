# @launchkit/sessions

**Responsibility:** Session history — persist each launched harness instance (harness, alias, timestamps, exit code) in SQLite.

**Public API (barrel `src/index.ts`):** `SessionStore` interface + `createSessionStore({ db, clock, idGen })`; the `Database` effect interface + `createInMemoryDatabase()` (recording fake) + `createBunSqliteDatabase(path)` (real adapter); `SessionInput`, `SessionFilter`, `SessionError`.

**Depends on:** `@launchkit/types`, `@launchkit/utils` (see build-plan/02-monorepo/boundaries.md).

**Effects owned:** sqlite (via the injected `Database` interface; the real adapter wraps `bun:sqlite`) — exposed to consumers as an injected interface; never reached around.

**Local rules:** Parameterized statements only — values go in the `params` array, never interpolated into the SQL string (a test asserts this for every statement). Index `startedAt` and `harnessId`. The real adapter reuses prepared statements. `Session` and the branded ids come from `@launchkit/types`; do not redefine or re-export them here.
