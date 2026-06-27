// Manual visual verification of the tooltip bubble's foreground/background
// contrast.
//
// Why a script and not a bun test: jsdom/happy-dom do NOT resolve CSS custom
// property chains (var(--sp-text-inverse) → var(--sp-graphite-950)), so they
// cannot detect the dark-on-dark bug where --sp-text-inverse is aliased to the
// same graphite-950 value as the bubble background. A real layout engine
// (Chromium) is required to compute the cascaded color. This mirrors the
// established pattern in verify-composer-autogrow.mjs.
//
// Run with: node packages/ui/scripts/verify-tooltip-bubble.mjs
// Requires Playwright's bundled Chromium (node_modules/.bin/playwright).
//
// Build path: bun build packages/ui/scripts/verify-entry-tooltip.ts → single
// bundle inlined with React via --no-external. Host HTML loads the bundle plus
// the REAL tokens.css + controls.css partials, then drives the trigger via
// window.__openTooltip() so the portal bubble mounts in document.body.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { chromium } from "playwright"

const ROOT = process.cwd()
const TOKENS_CSS = join(ROOT, "apps/desktop/views/main/styles/tokens.css")
const CONTROLS_CSS = join(ROOT, "apps/desktop/views/main/styles/controls.css")
const BASE_CSS = join(ROOT, "apps/desktop/views/main/styles/base.css")
const ENTRY_SRC = join(ROOT, "packages/ui/scripts/verify-entry-tooltip.ts")
const BUILD_DIR = join(tmpdir(), "spectrum-tooltip-verify-build")

const buildEntry = () => {
  if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true, force: true })
  mkdirSync(BUILD_DIR, { recursive: true })
  const result = spawnSync(
    "bun",
    ["build", ENTRY_SRC, "--outdir", BUILD_DIR, "--no-external"],
    { encoding: "utf8" },
  )
  if (result.status !== 0) {
    console.error("bun build failed:", result.stderr || result.stdout)
    process.exit(1)
  }
  return join(BUILD_DIR, "verify-entry-tooltip.js")
}

const pageHTML = (base, tokens, controls) => `
<!doctype html>
<html><head><meta charset="utf-8">
<style>${base}</style>
<style>${tokens}</style>
<style>${controls}</style>
</head><body>
<div id="root"></div>
<script type="module" src="/verify-entry-tooltip.js"></script>
</body></html>
`

const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg)
    process.exitCode = 1
  } else console.log("ok  -", msg)
}

// WCAG 2.x relative luminance + contrast ratio, used to confirm the bubble's
// foreground and background are not just different, but actually legible.
const rgbToLuminance = ([r, g, b]) => {
  const ch = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
const contrastRatio = (a, b) => {
  const la = rgbToLuminance(a)
  const lb = rgbToLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

// Chromium reports computed colors as "rgb(r, g, b)" or "rgba(r, g, b, a)".
const parseRgb = (s) => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s)
  if (m === null) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const startServer = (entryJsPath, html) => {
  const server = createServer((req, res) => {
    const url = req.url ?? "/"
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" })
      res.end(html)
      return
    }
    if (url === "/verify-entry-tooltip.js") {
      const body = readFileSync(entryJsPath)
      res.writeHead(200, { "content-type": "text/javascript" })
      res.end(body)
      return
    }
    res.writeHead(404)
    res.end("not found")
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

const main = async () => {
  for (const p of [TOKENS_CSS, CONTROLS_CSS, BASE_CSS]) {
    if (!existsSync(p)) {
      console.error("missing CSS:", p)
      process.exit(1)
    }
  }
  const base = readFileSync(BASE_CSS, "utf8")
  const tokens = readFileSync(TOKENS_CSS, "utf8")
  const controls = readFileSync(CONTROLS_CSS, "utf8")
  const entryJs = buildEntry()
  console.log("built entry ->", entryJs)

  const { server, port } = await startServer(
    entryJs,
    pageHTML(base, tokens, controls),
  )
  console.log(`serving on http://127.0.0.1:${port}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (err) => console.log("pageerror:", err.message))
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector(".lk-tooltip button", { timeout: 15000 })

  // Open the bubble via the real Tooltip component (mouseover/focus handlers).
  await page.evaluate(() => window.__openTooltip())
  await page.waitForSelector('[role="tooltip"]', { timeout: 5000 })

  const { color, background } = await page.evaluate(() => {
    const bubble = document.querySelector('[role="tooltip"]')
    if (bubble === null) {
      return { color: "", background: "" }
    }
    const cs = window.getComputedStyle(bubble)
    return { color: cs.color, background: cs.backgroundColor }
  })

  console.log(`bubble color       : ${color}`)
  console.log(`bubble background  : ${background}`)

  const fg = parseRgb(color)
  const bg = parseRgb(background)
  if (fg === null || bg === null) {
    assert(
      false,
      `could not parse computed colors (color=${color}, bg=${background})`,
    )
  } else {
    assert(
      color !== background,
      `bubble text color differs from background (${color} vs ${background})`,
    )
    const ratio = contrastRatio(fg, bg)
    console.log(`contrast ratio     : ${ratio.toFixed(2)}:1`)
    // 4.5:1 is WCAG AA for normal text. Tooltip text is small (var(--sp-text-xs)
    // = 0.75rem ≈ 12px), so we want at least 4.5:1 — well above "different
    // colors" which is what the dark-on-dark bug produces (ratio = 1:1).
    assert(
      ratio >= 4.5,
      `bubble contrast ratio ≥ 4.5:1 for small text (got ${ratio.toFixed(2)}:1)`,
    )
  }

  await browser.close()
  server.close()
  try {
    rmSync(BUILD_DIR, { recursive: true, force: true })
  } catch {}
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
