# @launchkit/db

**Responsibility:** The SQLite database abstraction and migrations. Owns the Drizzle schema (all tables), drizzle-kit-generated migration files, the migration runner, and the connection client. Other packages consume tables + `DbClient` from here; none open `bun:sqlite` directly.

**Public API (barrel `src/index.ts`):** the `sessions` table object + `schema`; `DbClient` interface + `createSqliteClient(path)`; `runMigrations(client)`; `tryDb(fn)`; `DbError`.

**Depends on:** `@launchkit/utils`, `drizzle-orm` (dev: `drizzle-kit`).

**Effects owned:** sqlite (via `bun:sqlite`, wrapped by Drizzle) — exposed only through the injected `DbClient`; never reached around.

**Local rules:** Migrations are **forward-only** and **generated, never hand-written** — edit `src/schema.ts`, run `bun run db:generate`, commit the result. Every Drizzle call crosses the boundary through `tryDb`, returning `Result<T, DbError>` — never throw. No `any`. The schema uses plain SQLite column types; consumers (e.g. `@launchkit/sessions`) map rows to branded domain types from `@launchkit/types`.

**Migrations are inlined into the JS bundle.** The drizzle-kit `.sql` files + `meta/_journal.json` under `src/migrations/` are the source of truth, but at build/dev time `scripts/bundle-migrations.ts` (chained into `db:generate`) codegens `src/migrations.generated.ts` — an array of `{ tag, when, statements[] }`. `runMigrations` applies that bundled data against the raw `bun:sqlite` connection inside a per-migration transaction, tracking applied tags in `__drizzle_migrations`. It does **not** read the migrations folder at runtime, so the packaged Electrobun app (a single `bun build` bundle with no sidecar folder) migrates correctly at startup. `migrations.generated.ts` is derived code but committed; regenerate it (never hand-edit) via `bun run db:generate`.
