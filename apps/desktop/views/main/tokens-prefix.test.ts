import { describe, expect, it } from "bun:test"

describe("design tokens", () => {
  it("uses the --sp- prefix (no legacy --lk- tokens remain)", async () => {
    const css = await Bun.file(
      new URL("./styles/tokens.css", import.meta.url),
    ).text()
    expect(css).not.toContain("--lk-")
    expect(css).toContain("--sp-")
  })
})
