import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
// Manual visual verification of the composer auto-grow behavior.
// Run with: node packages/ui/scripts/verify-composer-autogrow.mjs
// Requires Playwright's bundled Chromium (node_modules/.bin/playwright).
// Not part of `bun test` — jsdom has no layout engine, so the cap + inner-scroll
// behavior must be verified in a real browser engine.
//
// Build path: we `bun build` a tiny entry (verify-entry.ts) that imports the
// REAL Composer and mounts it onto #root, with --no-external so React is
// bundled in. The page loads one self-contained bundle via HTTP (file:// module
// loads are blocked by Chromium's CORS rules for about:blank/data: pages).
import { chromium } from "playwright"

const ROOT = process.cwd()
const CSS_PATH = join(ROOT, "apps/desktop/views/main/styles/run-view.css")
const ENTRY_SRC = join(ROOT, "packages/ui/scripts/verify-entry.ts")
const BUILD_DIR = join(tmpdir(), "spectrum-composer-verify-build")

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
  return join(BUILD_DIR, "verify-entry.js")
}

const pageHTML = (css) => `
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; }
  :root {
    --sp-space-1: 4px; --sp-space-2: 8px; --sp-space-3: 16px;
    --sp-border: #ccc; --sp-border-strong: #999;
    --sp-surface-raised: #fff; --sp-radius-lg: 12px;
    --sp-text: #111; --sp-text-sm: 14px;
    --sp-font-sans: system-ui, sans-serif;
    --sp-bg-subtle: #f5f5f5; --sp-text-muted: #666;
    --sp-primary: #007bff; --sp-primary-active: #0056b3;
    --sp-on-primary: #fff; --sp-focus-ring: rgba(0,123,255,0.3);
    --sp-duration: 150ms; --sp-ease: ease;
  }
  #root { display: flex; flex-direction: column; min-height: 100vh; }
</style>
<style>${css}</style>
</head><body>
<div id="root"></div>
<script type="module" src="/verify-entry.js"></script>
</body></html>
`

const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg)
    process.exitCode = 1
  } else console.log("ok  -", msg)
}

const startServer = (entryJsPath, css) => {
  const html = pageHTML(css)
  const server = createServer((req, res) => {
    const url = req.url ?? "/"
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" })
      res.end(html)
      return
    }
    if (url === "/verify-entry.js") {
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
  if (!existsSync(CSS_PATH)) {
    console.error("missing CSS:", CSS_PATH)
    process.exit(1)
  }
  const css = readFileSync(CSS_PATH, "utf8")
  const entryJs = buildEntry()
  console.log("built entry ->", entryJs)

  const { server, port } = await startServer(entryJs, css)
  console.log(`serving on http://127.0.0.1:${port}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page.on("console", (msg) => console.log("browser:", msg.type(), msg.text()))
  page.on("pageerror", (err) => console.log("pageerror:", err.message))
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector(".lk-composer__input", { timeout: 15000 })

  const cap = 900 / 3 // 33dvh of a 900px viewport ≈ 297px

  // (a) short input → grows, no scrollbar, height < cap
  await page.evaluate((v) => window.__setText(v), "one line of text")
  await page.waitForTimeout(60)
  let h = await page.evaluate(
    () => document.querySelector(".lk-composer__input").offsetHeight,
  )
  let scrollH = await page.evaluate(
    () => document.querySelector(".lk-composer__input").scrollHeight,
  )
  assert(
    h > 0 && h < cap,
    `short input: height ${h}px below cap ~${Math.round(cap)}px`,
  )
  assert(
    scrollH <= h + 1,
    `short input: no overflow (scrollHeight ${scrollH} <= clientHeight ${h})`,
  )

  // (b) long input → pinned at cap, scrollbar appears
  await page.evaluate((v) => window.__setText(v), "x\n".repeat(80))
  await page.waitForTimeout(60)
  h = await page.evaluate(
    () => document.querySelector(".lk-composer__input").offsetHeight,
  )
  scrollH = await page.evaluate(
    () => document.querySelector(".lk-composer__input").scrollHeight,
  )
  assert(
    Math.abs(h - cap) <= 5,
    `long input: height ${h}px pinned at cap ~${Math.round(cap)}px`,
  )
  assert(
    scrollH > h,
    `long input: inner scroll present (scrollHeight ${scrollH} > clientHeight ${h})`,
  )

  // (c) clear → collapses toward min-height
  await page.evaluate((v) => window.__setText(v), "")
  await page.waitForTimeout(60)
  h = await page.evaluate(
    () => document.querySelector(".lk-composer__input").offsetHeight,
  )
  assert(
    h < cap,
    `cleared: height ${h}px collapsed below cap ~${Math.round(cap)}px`,
  )

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
