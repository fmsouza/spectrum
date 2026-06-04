import type { ElectrobunConfig } from "electrobun"

/**
 * Electrobun build configuration for the LaunchKit binary (Electrobun v1.18.x schema).
 *
 * - `build.bun.entrypoint` → the main (Bun) process; bundled to `bun/index.js`. The Electrobun
 *   launcher loads that file via `new Worker(...)`, where `import.meta.main` is always `false`, so
 *   the entry (`src/index.ts`) must run startup unconditionally — it is a thin shell over the
 *   tested `main`/`buildRealDeps` (see src/main.ts) that calls
 *   `runApp(detectMode(argv), argv, buildRealDeps(...))`.
 * - `build.views.main.entrypoint` → the React webview; bundled (target: browser) to
 *   `views/main/app.js`, which `views/main/index.html` references as `./app.js`.
 * - `build.copy` → copies the CSP-hardened `index.html` AND the global stylesheet `app.css`
 *   next to the bundled `app.js` so the `views://main/index.html` URL (see `gui/window.ts`)
 *   resolves to local, bundled assets only (the `<link rel="stylesheet" href="./app.css">`
 *   loads same-origin under `style-src 'self'`).
 * - `build.mac.createDmg: false` → a local app-bundle build needs no DMG/codesign tooling.
 * - `build.watch`/`build.watchIgnore` → extra paths for `electrobun dev --watch` (rebuild + relaunch
 *   on change). The default watch only covers this app's `src/` + `views/`; we add the workspace
 *   `packages/` so editing a `@launchkit/*` package (proxy, pty, harnesses, …) also live-reloads.
 *   Test files are ignored so running/saving tests doesn't trigger app rebuilds.
 */
const config = {
  app: {
    name: "LaunchKit",
    identifier: "dev.launchkit.app",
    version: "0.1.0",
  },
  build: {
    bun: { entrypoint: "src/index.ts" },
    views: {
      main: { entrypoint: "views/main/app.tsx" },
    },
    copy: {
      "views/main/index.html": "views/main/index.html",
      "views/main/app.css": "views/main/app.css",
      "views/main/xterm.css": "views/main/xterm.css",
    },
    mac: { createDmg: false },
  },
} satisfies ElectrobunConfig

// `build.watch`/`build.watchIgnore` drive `electrobun dev --watch` but are absent from the v1.18.1
// `ElectrobunConfig` type (the CLI reads them at runtime). Attach them AFTER the `satisfies` check so
// the core config is still type-validated while these extra, runtime-only keys pass through.
export default {
  ...config,
  build: {
    ...config.build,
    watch: ["../../packages"],
    watchIgnore: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js"],
  },
}
