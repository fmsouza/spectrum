import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, "page.css"), "utf8")

describe(".settings-timeouts section", () => {
  it("lays out as a flex column with at least --sp-space-4 gap between fields", () => {
    const block = css.match(/\.settings-timeouts\s*\{[^}]*\}/s)?.[0] ?? ""
    expect(block).toContain("display: flex")
    expect(block).toContain("flex-direction: column")
    expect(block).toContain("gap: var(--sp-space-4)")
  })

  it("has the same card chrome as .settings-updates (surface/border/radius)", () => {
    const block = css.match(/\.settings-timeouts\s*\{[^}]*\}/s)?.[0] ?? ""
    expect(block).toContain("background: var(--sp-surface)")
    expect(block).toContain("border: 1px solid var(--sp-border)")
    expect(block).toContain("border-radius: var(--sp-radius-lg)")
  })
})

describe(".settings-timeouts__hint caption", () => {
  it("renders small (<= --sp-text-sm) and muted, with no paragraph margin", () => {
    const block = css.match(/\.settings-timeouts__hint\s*\{[^}]*\}/s)?.[0] ?? ""
    expect(block).toContain("font-size: var(--sp-text-sm)")
    expect(block).toContain("color: var(--sp-text-muted)")
    expect(block).toContain("margin: 0")
  })
})
