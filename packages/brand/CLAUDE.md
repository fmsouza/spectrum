# @launchkit/brand

**Responsibility:** single source of truth for the Spectrum identity — the pure React `SpectrumMark` component plus the canonical design-token CSS, self-hosted Geist woff2 + `@font-face`, and raster identity assets (favicon, app/tray icon, OG card, README hero).

**Public API (barrel `src/index.ts`):** `SpectrumMark` (+ `SpectrumMarkProps`, `MarkVariant`). CSS, fonts, and raster assets under `assets/` are referenced by path and copied by the Electrobun build — they are NOT JS-imported.

**Depends on:** `react` only. No `@launchkit/*` deps; zero IO; no effects.

**Local rules:** marks are pure/presentational (typed props in, SVG out). `assets/tokens/spectrum-tokens.css` is the canonical token set using `--sp-*` variables (the original brand-kit reference is intentionally NOT committed — it lives outside the repo / in history). The desktop app's `tokens.css` derives from it plus a documented app-extension block. Never import a raster/CSS file as a JS module.
