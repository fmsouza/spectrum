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

  it("styles the post-redesign rail+master+detail shell (not the old 2-col one)", () => {
    // The Phase-6 AppShell renders a 3-zone layout: rail (Primary nav) + master
    // (Sessions/Settings nav) + detail (<main>). The shell grid must declare a
    // master column token, the master navs must be targeted, and the sessions
    // detail container must be styled. Guards against the CSS desyncing from the
    // shell DOM again (the unstyled-master/detail regression).
    expect(appCss).toContain("--master-w")
    expect(appCss).toContain('nav[aria-label="Sessions"]')
    expect(appCss).toContain(".sessions-detail")
    // The rail no longer injects a "LaunchKit" ::before wordmark (the component
    // renders its own [data-app-icon] "LK"); styling that text would double it.
    expect(appCss).not.toContain('content: "LaunchKit"')
    expect(appCss).toContain("[data-app-icon]")
    // The deleted tabbed TerminalPage/TabStrip rules must be gone.
    expect(appCss).not.toContain(".terminal-tab")
    expect(appCss).not.toContain(".terminal-page")
  })
})
