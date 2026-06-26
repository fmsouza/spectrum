import { createAppContext } from "@spectrum/runtime-core"

import { createGuiContext } from "./composition"
import { buildRealDeps, main } from "./main"

/**
 * Electrobun bun-process entrypoint. Bundled to `bun/index.js`, which the Electrobun launcher
 * loads via `new Worker(...)`. Inside a Worker `import.meta.main` is `false`, so startup must NOT
 * be gated on it — this file runs `main` unconditionally. All decision logic stays in the pure,
 * tested `main` / `buildRealDeps` (see main.ts); this is a thin, build-verified shell.
 *
 * Stage 1 (CLI/desktop split): the GUI context is `createGuiContext(createAppContext())` —
 * `createAppContext` lives in `@spectrum/runtime-core` and is the shared composition root;
 * `createGuiContext` layers the GUI seams (runner, socket, watchdog, updater, pickFolder,
 * openExternalUrl, resetApp) on top.
 */
await main(
  process.argv,
  buildRealDeps(() => createGuiContext(createAppContext())),
)
