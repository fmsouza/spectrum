import type { ElectrobunConfig } from "electrobun"

/**
 * Electrobun build configuration for the LaunchKit binary (Electrobun v1.18.x schema).
 *
 * - `build.bun.entrypoint` → the main (Bun) process; bundled to `bun/main.js`. This is the
 *   dual-mode entry that calls `runApp(detectMode(argv), argv, buildRealDeps(...))`.
 * - `build.views.main.entrypoint` → the React webview; bundled (target: browser) to
 *   `views/main/app.js`, which `views/main/index.html` references as `./app.js`.
 * - `build.copy` → copies the CSP-hardened `index.html` next to the bundled `app.js` so the
 *   `views://main/index.html` URL (see `gui/window.ts`) resolves to local, bundled assets only.
 * - `build.mac.createDmg: false` → a local app-bundle build needs no DMG/codesign tooling.
 */
export default {
  app: {
    name: "LaunchKit",
    identifier: "dev.launchkit.app",
    version: "0.1.0",
  },
  build: {
    bun: { entrypoint: "src/main.ts" },
    views: {
      main: { entrypoint: "views/main/app.tsx" },
    },
    copy: {
      "views/main/index.html": "views/main/index.html",
    },
    mac: { createDmg: false },
  },
} satisfies ElectrobunConfig
