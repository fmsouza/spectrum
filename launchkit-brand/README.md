# LaunchKit — Brand Package

**Theme:** Spectrum Router · **Version:** 1.0

The identity makes LaunchKit's job literal: one steady **anchor** hub with a **spectrum**
of provider endpoints fanning out from it. Dark-first, modern, and built on **Geist** —
the same typeface family behind the Vercel AI SDK that LaunchKit already streams through.

Open **`brand/launchkit-brand-guidelines.html`** in a browser for the full guide.

## What's inside

```
launchkit-brand/
├─ brand/
│  └─ launchkit-brand-guidelines.html   ← start here (self-contained)
├─ logo/
│  ├─ launchkit-logo-horizontal.svg      primary lockup (on dark)
│  ├─ launchkit-logo-horizontal-onlight.svg
│  ├─ launchkit-logo-mono-white.svg / -mono-black.svg
│  ├─ launchkit-mark.svg                 hub symbol (colour)
│  ├─ launchkit-mark-mono-white.svg / -mono-black.svg
│  ├─ launchkit-icon.svg                 app / tray icon (squircle tile)
│  ├─ launchkit-icon-{1024,512,256,128,64,32,16}.png
│  └─ launchkit-logo-horizontal*.png, launchkit-mark-512.png
├─ favicon/
│  ├─ launchkit-favicon.svg              simplified for tiny sizes
│  ├─ favicon-{64,48,32,16}.png
│  └─ favicon.ico                        multi-size
├─ tokens/
│  └─ launchkit-tokens.css               CSS variables (dark + light)
└─ social/
   ├─ launchkit-og-card.svg / .png       1200×630 social / OG preview
   └─ launchkit-readme-hero.svg / .png   1280×400 README banner
```

## Quick start

**Design tokens** — drop into the React UI:

```js
import "./tokens/launchkit-tokens.css";
/* background: var(--lk-bg); color: var(--lk-text);
   font-family: var(--lk-font-sans); accent: var(--lk-primary); */
```

Light mode: set `data-theme="light"` on `<html>`.

**Fonts** — Geist + Geist Mono:

```bash
npm i geist          # ships the TTF/woff2 used here
```

Or load from Google Fonts:
`https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600`

**Repo social preview** — on GitHub: *Settings → General → Social preview →*
upload `social/launchkit-og-card.png`. Add the README banner with
`![LaunchKit](social/launchkit-readme-hero.png)`.

## Core values

| Token | Hex | Role |
| --- | --- | --- |
| Anchor blue | `#5B8DEF` | Brand + primary actions (the hub) |
| Violet | `#A56BFF` | Spectrum accent — a provider/model family |
| Cyan | `#22D3EE` | Spectrum accent |
| Amber | `#FFB13B` | Spectrum accent / warning |
| Green | `#4ADE80` | Spectrum accent / success |
| Graphite 950 | `#0C0D10` | App background |
| Graphite 100 | `#ECEDF1` | Primary text on dark |

**Type:** Geist (UI/display) · Geist Mono (CLI, aliases, keys, paths).
**Logo:** always "LaunchKit" — one word, capital L and K. Keep clear space ≥ the hub
diameter; minimum mark 20 px, lockup 120 px wide. Don't recolour the hub, stretch, or add effects.

*Assets generated for github.com/fmsouza/launchkit.*
