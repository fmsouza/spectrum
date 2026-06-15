# @spectrum/data-admin

**Responsibility:** Destructive, cross-table maintenance on the shared SQLite db — transactional cascade deletes (a session with its run events; a project with all its sessions and their run events). The single owner of multi-table deletes; the create/query-only stores stay append-only.

**Public API (barrel `src/index.ts`):** `DataAdmin` interface + `createDataAdmin({ db })`; `DataAdminError`.

**Depends on:** `@spectrum/db`, `@spectrum/types`, `@spectrum/utils`.

**Effects owned:** none directly — sqlite is reached through the injected `DbClient`. Every Drizzle call crosses the boundary through `tryDb`, returning `Result<T, DataAdminError>`.

**Local rules:** Schema and migrations live in `@spectrum/db`; this package never issues DDL. Cascades run inside one `handle.transaction(...)` so a mid-cascade failure rolls back. Deletes are children-first (run_events → sessions → project). Deleting a missing id is an idempotent no-op (0 rows), not an error.
