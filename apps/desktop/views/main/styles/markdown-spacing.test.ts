import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, "run-view.css"), "utf8")

describe(".lk-markdown spacing", () => {
  it("uses a comfortable line-height (>= 1.6) so conversation text breathes", () => {
    const block = css.match(/\.lk-markdown\s*\{[^}]*\}/s)?.[0] ?? ""
    const lh = block.match(/line-height:\s*([\d.]+)/)
    expect(lh, ".lk-markdown must declare line-height").not.toBeNull()
    expect(Number(lh?.[1])).toBeGreaterThanOrEqual(1.6)
  })

  it("separates markdown blocks by at least --sp-space-3 (12px)", () => {
    const block = css.match(/\.lk-markdown\s*\{[^}]*\}/s)?.[0] ?? ""
    expect(block).toContain("gap: var(--sp-space-3)")
  })
})

describe(".lk-message-bubble padding", () => {
  it("has at least --sp-space-3 vertical padding so messages have inner room", () => {
    const block = css.match(/\.lk-message-bubble\s*\{[^}]*\}/s)?.[0] ?? ""
    // padding: <vert> <horiz>; vert must be --sp-space-3 or larger.
    const pad = block.match(
      /padding:\s*var\(--sp-space-(\d+)\)\s+var\(--sp-space-\d+\)/,
    )
    expect(
      pad,
      ".lk-message-bubble must declare padding in sp-space tokens",
    ).not.toBeNull()
    expect(Number(pad?.[1])).toBeGreaterThanOrEqual(3)
  })
})
