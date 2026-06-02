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
 */
export default {
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
    },
    mac: { createDmg: false },
  },
} satisfies ElectrobunConfig
