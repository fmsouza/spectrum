import { describe, expect, it } from "bun:test"

const here = (p: string) => new URL(p, import.meta.url)

describe("@spectrum/brand fonts", () => {
  it("ships the two Geist variable woff2 files", async () => {
    expect(await Bun.file(here("./Geist-Variable.woff2")).exists()).toBe(true)
    expect(await Bun.file(here("./GeistMono-Variable.woff2")).exists()).toBe(
      true,
    )
  })

  it("declares @font-face for Geist and Geist Mono over the full weight range", async () => {
    const css = await Bun.file(here("./fonts.css")).text()
    expect(css).toContain('font-family: "Geist"')
    expect(css).toContain('font-family: "Geist Mono"')
    expect(css).toContain("font-weight: 100 900")
    expect(css).toContain('format("woff2")')
    expect(css).toContain("font-display: swap")
  })
})
