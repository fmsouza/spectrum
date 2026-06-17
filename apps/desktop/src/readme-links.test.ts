import { describe, expect, it } from "bun:test"

describe("README download links", () => {
  it("never references the old fmsouza/launchkit repo after the spectrum rename", async () => {
    const readme = await Bun.file(
      new URL("../../../README.md", import.meta.url),
    ).text()
    expect(readme).not.toContain("fmsouza/launchkit")
  })

  it("points every github release URL at fmsouza/spectrum", async () => {
    const readme = await Bun.file(
      new URL("../../../README.md", import.meta.url),
    ).text()
    const githubUrls = readme.match(/github\.com\/fmsouza\/[a-z-]+/g) ?? []
    expect(githubUrls.length).toBeGreaterThan(0)
    for (const url of githubUrls)
      expect(url).toBe("github.com/fmsouza/spectrum")
  })
})
