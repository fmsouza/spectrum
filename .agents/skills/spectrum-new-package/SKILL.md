---
name: spectrum-new-package
description: Use when creating a new internal package under packages/
---

# spectrum-new-package

Checklist for creating a new `@spectrum/<name>` package:

1. Create `packages/<name>/` directory.
2. Create `package.json`: name `@spectrum/<name>`, `"type": "module"`, `"private": true`, `"exports": { ".": "./src/index.ts" }`, `"scripts": { "typecheck": "tsc --noEmit", "test": "bun test" }`.
3. Create `tsconfig.json`: extends the right `tooling/tsconfig` preset with `"references"` to dependency packages.
4. Create `src/index.ts` barrel file.
5. Create a co-located smoke test.
6. Add the package to the dependency DAG (update root `AGENTS.md` and any per-package `AGENTS.md` that needs to depend on the new package).
7. Create a short `AGENTS.md` modeled on the existing per-package templates (e.g. `packages/pty/AGENTS.md` — canonical short form).
8. If the package owns effects or handles errors, accept an injected `Logger` (default `createNoopLogger()`) and log at its boundaries (effect failures, lifecycle, handler errors); never `console.*`; reference `docs/01-conventions/logging.md`.
9. If the feature performs user-triggered actions that can fail, surface failures via the notifications engine (`useNotifications`) at the page/hook layer — the store returns `Result`, the shell toasts; see `docs/01-conventions/notifications.md`.
10. Add the package reference to root `tsconfig.json`.
11. Verify `bun run typecheck`, `bun run lint`, `bun test` all pass.
