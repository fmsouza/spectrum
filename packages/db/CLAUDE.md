# @launchkit/db

**Responsibility:** The SQLite database abstraction and migrations. Owns the Drizzle schema (all tables), drizzle-kit-generated migration files, the migration runner, and the connection client. Other packages consume tables + `DbClient` from here; none open `bun:sqlite` directly.

**Public API (barrel `src/index.ts`):** the `sessions` table object + `schema`; `DbClient` interface + `createSqliteClient(path)`; `runMigrations(client)`; `tryDb(fn)`; `DbError`.

**Depends on:** `@launchkit/types`, `@launchkit/utils`, `drizzle-orm` (dev: `drizzle-kit`).

**Effects owned:** sqlite (via `bun:sqlite`, wrapped by Drizzle) — exposed only through the injected `DbClient`; never reached around.

**Local rules:** Migrations are **forward-only** and **generated, never hand-written** — edit `src/schema.ts`, run `bun run db:generate`, commit the result. Every Drizzle call crosses the boundary through `tryDb`, returning `Result<T, DbError>` — never throw. No `any`. Branded ids/`Session` come from `@launchkit/types`.
