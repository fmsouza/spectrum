# @launchkit/brand

**Responsibility:** single source of truth for the LaunchKit "Spectrum Router" identity — the pure React `LaunchKitMark` component plus the canonical design-token CSS, self-hosted Geist woff2 + `@font-face`, and raster identity assets (favicon, app/tray icon, OG card, README hero).

**Public API (barrel `src/index.ts`):** `LaunchKitMark` (+ `LaunchKitMarkProps`, `MarkVariant`). CSS, fonts, and raster assets under `assets/` are referenced by path and copied by the Electrobun build — they are NOT JS-imported.

**Depends on:** `react` only. No `@launchkit/*` deps; zero IO; no effects.

**Local rules:** marks are pure/presentational (typed props in, SVG out). Keep `assets/tokens/launchkit-tokens.css` byte-identical to the design reference in `launchkit-brand/tokens/` except for the documented app-extension block. Never import a raster/CSS file as a JS module.
