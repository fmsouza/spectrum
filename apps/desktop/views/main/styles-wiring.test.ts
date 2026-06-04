import { describe, expect, it } from "bun:test"

// Regression guard for the unstyled-GUI bug: the app shipped no CSS at all, so the
// React webview rendered with raw browser defaults (serif font, blue underlined links,
// no layout). The fix is a single global stylesheet (`app.css`) that must be (a) linked
// from `index.html`, (b) copied next to the bundled `app.js` by the Electrobun build, and
// (c) non-trivial — actually targeting the real component markup.

const indexHtml = await Bun.file(
  new URL("./index.html", import.meta.url),
).text()

const electrobunConfig = await Bun.file(
  new URL("../../electrobun.config.ts", import.meta.url),
).text()

const appCss = await Bun.file(new URL("./app.css", import.meta.url)).text()

describe("views/main global stylesheet wiring", () => {
  it("links app.css from index.html so the webview loads the styles", () => {
    expect(indexHtml).toMatch(
      /<link\s+rel="stylesheet"\s+href="\.\/app\.css"\s*\/?>/,
    )
  })

  it("declares the link before the module script so styles apply on first paint", () => {
    const linkIndex = indexHtml.indexOf('href="./app.css"')
    const scriptIndex = indexHtml.indexOf('src="./app.js"')
    expect(linkIndex).toBeGreaterThan(-1)
    expect(scriptIndex).toBeGreaterThan(-1)
    expect(linkIndex).toBeLessThan(scriptIndex)
  })

  it("copies views/main/app.css in the Electrobun build so it ships next to app.js", () => {
    expect(electrobunConfig).toContain(
      '"views/main/app.css": "views/main/app.css"',
    )
  })

  it("ships a non-trivial stylesheet that targets the real component markup", () => {
    expect(appCss.length).toBeGreaterThan(2000)
    // Atom variants, the AppShell sidebar nav, and themed light/dark support.
    expect(appCss).toContain("[data-variant=")
    expect(appCss).toContain('nav[aria-label="Primary"]')
    expect(appCss).toContain("prefers-color-scheme")
  })
})
