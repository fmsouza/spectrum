import { describe, expect, it } from "bun:test"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const dir = new URL("./", import.meta.url)

describe("design tokens", () => {
  it("uses the --sp- prefix in every stylesheet (no legacy --lk- tokens remain)", async () => {
    const files = readdirSync(fileURLToPath(dir)).filter((f) =>
      f.endsWith(".css"),
    )
    expect(files.length).toBeGreaterThan(1) // guard against an empty or single-file scan passing vacuously
    for (const f of files) {
      const css = await Bun.file(new URL(f, dir)).text()
      expect(css, `${f} should not contain --lk-`).not.toContain("--lk-")
    }
  })

  it("ships the --sp- prefixed token set in tokens.css", async () => {
    const css = await Bun.file(new URL("tokens.css", dir)).text()
    expect(css).toContain("--sp-")
  })
})
