import { describe, expect, it } from "bun:test"

// Regression guard for the stylesheet wiring: the CSS must be (a) linked from
// `index.html` in the correct cascade order, (b) copied next to the bundled `app.js`
// by the Electrobun build, and (c) contain the key structural selectors.

const indexHtml = await Bun.file(
  new URL("./index.html", import.meta.url),
).text()

const electrobunConfig = await Bun.file(
  new URL("../../electrobun.config.ts", import.meta.url),
).text()

const PARTIALS = [
  "tokens.css",
  "base.css",
  "controls.css",
  "primitives.css",
  "shell.css",
  "sessions-master.css",
  "sessions-detail.css",
  "forms.css",
  "modal.css",
  "lists.css",
  "page.css",
] as const

describe("views/main stylesheet partials wiring", () => {
  it("links every partial from index.html in styles/ in cascade order", () => {
    const positions = PARTIALS.map((p) =>
      indexHtml.indexOf(`href="./styles/${p}"`),
    )
    for (const [i, pos] of positions.entries())
      expect(pos, `${PARTIALS[i]} must be linked`).toBeGreaterThan(-1)
    const sorted = [...positions].sort((a, b) => a - b)
    expect(positions).toEqual(sorted) // links appear in declared order
  })

  it("links the partials before the module script so styles apply on first paint", () => {
    const lastLink = Math.max(
      ...PARTIALS.map((p) => indexHtml.indexOf(`href="./styles/${p}"`)),
    )
    expect(lastLink).toBeLessThan(indexHtml.indexOf('src="./app.js"'))
  })

  it("copies every partial in the Electrobun build so they ship next to app.js", () => {
    // Normalise the config source so biome's line-wrapping of long keys doesn't
    // affect the check (both key and value must appear regardless of wrapping).
    const flat = electrobunConfig.replace(/\s+/g, " ")
    for (const p of PARTIALS)
      expect(flat).toContain(
        `"views/main/styles/${p}": "views/main/styles/${p}"`,
      )
  })

  it("still ships the post-redesign shell + sessions detail markers", async () => {
    const shell = await Bun.file(
      new URL("./styles/shell.css", import.meta.url),
    ).text()
    const sessions = await Bun.file(
      new URL("./styles/sessions-detail.css", import.meta.url),
    ).text()
    expect(shell).toContain('nav[aria-label="Primary"]')
    expect(sessions).toContain(".sessions-detail")
  })

  it("guards key structural selectors so CSS stays in sync with the shell DOM", async () => {
    const tokens = await Bun.file(
      new URL("./styles/tokens.css", import.meta.url),
    ).text()
    const controls = await Bun.file(
      new URL("./styles/controls.css", import.meta.url),
    ).text()
    const shell = await Bun.file(
      new URL("./styles/shell.css", import.meta.url),
    ).text()
    const sessionsMaster = await Bun.file(
      new URL("./styles/sessions-master.css", import.meta.url),
    ).text()
    const sessionsDetail = await Bun.file(
      new URL("./styles/sessions-detail.css", import.meta.url),
    ).text()

    expect(tokens).toContain("--master-w")
    expect(tokens).toContain("prefers-color-scheme")
    expect(controls).toContain("[data-variant=")
    expect(shell).toContain(".lk-shell")
    expect(shell).toContain("[data-app-icon]")
    expect(shell).toContain('nav[aria-label="Primary"]')
    expect(sessionsMaster).toContain('nav[aria-label="Sessions"]')
    expect(sessionsDetail).toContain(".sessions-detail")
  })
})
