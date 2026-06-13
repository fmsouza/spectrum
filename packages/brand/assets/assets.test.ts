import { describe, expect, it } from "bun:test"

const here = (p: string) => new URL(p, import.meta.url)

describe("@launchkit/brand assets", () => {
  it("ships the canonical token file with the --sp-bg variable", async () => {
    const css = await Bun.file(here("./tokens/spectrum-tokens.css")).text()
    expect(css).toContain("--sp-bg:")
    expect(css).toContain('[data-theme="light"]')
  })

  it("ships the app icon and og card rasters", async () => {
    expect(
      await Bun.file(here("./raster/spectrum-icon-512.png")).exists(),
    ).toBe(true)
    expect(await Bun.file(here("./raster/spectrum-og-card.png")).exists()).toBe(
      true,
    )
    expect(await Bun.file(here("./raster/favicon.ico")).exists()).toBe(true)
  })
})
