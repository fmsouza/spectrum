import { describe, expect, it } from "bun:test"
import { type SmokeCheck, parseSmokeArgs } from "./smoke"

describe("parseSmokeArgs", () => {
  it("uses .exe suffix on win32", () => {
    expect(parseSmokeArgs("win32").binName).toBe("spectrum-cli.exe")
  })

  it("uses bare name on darwin", () => {
    expect(parseSmokeArgs("darwin").binName).toBe("spectrum-cli")
  })

  it("uses bare name on linux", () => {
    expect(parseSmokeArgs("linux").binName).toBe("spectrum-cli")
  })
})

describe("SmokeCheck", () => {
  it("exposes the two policy variants", () => {
    const checks: readonly SmokeCheck[] = [
      "require-exit-0",
      "require-exit-0-and-output",
    ]
    expect(checks).toHaveLength(2)
  })
})
