---
name: launchkit-new-package
description: Use when creating a new internal package under packages/
---

# launchkit-new-package

Checklist for creating a new `@launchkit/<name>` package:

1. Create `packages/<name>/` directory.
2. Create `package.json`: name `@launchkit/<name>`, `"type": "module"`, `"private": true`, `"exports": { ".": "./src/index.ts" }`, `"scripts": { "typecheck": "tsc --noEmit", "test": "bun test" }`.
3. Create `tsconfig.json`: extends the right `tooling/tsconfig` preset with `"references"` to dependency packages.
4. Create `src/index.ts` barrel file.
5. Create a co-located smoke test.
6. Add the package to the dependency DAG (update root `CLAUDE.md` and any per-package `CLAUDE.md` that needs to depend on the new package).
7. Create a short `CLAUDE.md` modeled on the existing per-package templates (e.g. `packages/pty/CLAUDE.md` — canonical short form).
8. Add the package reference to root `tsconfig.json`.
9. Verify `bun run typecheck`, `bun run lint`, `bun test` all pass.
