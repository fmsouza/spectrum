# @launchkit/projects

**Responsibility:** Projects — a named group of sessions (one per folder). Find-or-create a project by its absolute path, and list projects alphabetically with their session counts, via the @launchkit/db SQLite layer.

**Public API (barrel `src/index.ts`):** `ProjectStore` interface + `createProjectStore({ db, clock, idGen })`; `ProjectWithCount`, `ProjectError`.

**Depends on:** `@launchkit/db`, `@launchkit/types`, `@launchkit/utils`

**Effects owned:** none directly — sqlite is reached through the injected `DbClient`. Every Drizzle call crosses the boundary through `tryDb`, returning `Result<T, ProjectError>`.

**Local rules:** Schema and migrations live in `@launchkit/db`; this package never issues DDL. `Project` and branded ids come from `@launchkit/types`. The `name` is the folder basename; `path` is unique (enables atomic find-or-create).
