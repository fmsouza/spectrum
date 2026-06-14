import type { ElectrobunConfig } from "electrobun"

/**
 * Electrobun build configuration for the Spectrum binary (Electrobun v1.18.x schema).
 *
 * - `build.bun.entrypoint` → the main (Bun) process; bundled to `bun/index.js`. The Electrobun
 *   launcher loads that file via `new Worker(...)`, where `import.meta.main` is always `false`, so
 *   the entry (`src/index.ts`) must run startup unconditionally — it is a thin shell over the
 *   tested `main`/`buildRealDeps` (see src/main.ts) that calls
 *   `runApp(detectMode(argv), argv, buildRealDeps(...))`.
 * - `build.views.main.entrypoint` → the React webview; bundled (target: browser) to
 *   `views/main/app.js`, which `views/main/index.html` references as `./app.js`.
 * - `build.copy` → ships the CSP-hardened `index.html` and the split stylesheet partials under
 *   `views/main/styles/` (tokens, base, controls, primitives, shell, sessions-master,
 *   sessions-detail, forms, modal, lists, page) next to the bundled `app.js` so the
 *   `views://main/index.html` URL (see `gui/window.ts`) resolves to local, bundled assets only —
 *   each partial is linked same-origin under `style-src 'self'`.
 * - `build.mac.createDmg: true` → emit a DMG installer for macOS releases (unsigned — signing is
 *   out of scope for now).
 * - `build.watch`/`build.watchIgnore` → extra paths for `electrobun dev --watch` (rebuild + relaunch
 *   on change). The default watch only covers this app's `src/` + `views/`; we add the workspace
 *   `packages/` so editing a `@spectrum/*` package (proxy, harnesses, drivers, …) also live-reloads.
 *   Test files are ignored so running/saving tests doesn't trigger app rebuilds.
 */
const config = {
  app: {
    name: "Spectrum",
    identifier: "dev.spectrum.app",
    version: "0.1.0",
  },
  // Auto-update distribution. `baseUrl` is the STABLE rolling-tag URL that CI
  // force-moves on every release, so the running app always finds the newest
  // per-channel `<channel>-<os>-<arch>-update.json` + patch + tarball there.
  // Channel lives in the artifact filename, so one baseUrl serves both channels.
  release: {
    baseUrl: "https://github.com/fmsouza/spectrum/releases/download/updates",
    generatePatch: true,
  },
  build: {
    bun: { entrypoint: "src/index.ts" },
    views: {
      main: { entrypoint: "views/main/app.tsx" },
    },
    copy: {
      "views/main/index.html": "views/main/index.html",
      "views/main/styles/fonts.css": "views/main/styles/fonts.css",
      "views/main/fonts/Geist-Variable.woff2":
        "views/main/fonts/Geist-Variable.woff2",
      "views/main/fonts/GeistMono-Variable.woff2":
        "views/main/fonts/GeistMono-Variable.woff2",
      "views/main/styles/tokens.css": "views/main/styles/tokens.css",
      "views/main/styles/base.css": "views/main/styles/base.css",
      "views/main/styles/controls.css": "views/main/styles/controls.css",
      "views/main/styles/primitives.css": "views/main/styles/primitives.css",
      "views/main/styles/shell.css": "views/main/styles/shell.css",
      "views/main/styles/sessions-master.css":
        "views/main/styles/sessions-master.css",
      "views/main/styles/sessions-detail.css":
        "views/main/styles/sessions-detail.css",
      "views/main/styles/run-view.css": "views/main/styles/run-view.css",
      "views/main/styles/forms.css": "views/main/styles/forms.css",
      "views/main/styles/modal.css": "views/main/styles/modal.css",
      "views/main/styles/lists.css": "views/main/styles/lists.css",
      "views/main/styles/page.css": "views/main/styles/page.css",
      "views/main/spectrum-favicon.svg": "views/main/spectrum-favicon.svg",
      "views/main/favicon.ico": "views/main/favicon.ico",
      "views/main/spectrum-tray.png": "views/main/spectrum-tray.png",
    },
    // `icons` points at the macOS .iconset (built from the brand squircle icon); Electrobun
    // runs `iconutil` at build time to emit AppIcon.icns (CFBundleIconFile) into the bundle.
    mac: { createDmg: true, icons: "icon.iconset" },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
    win: {},
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
