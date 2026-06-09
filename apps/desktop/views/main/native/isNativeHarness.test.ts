import { describe, expect, it } from "bun:test"
import { HarnessIdSchema } from "@launchkit/types"
import { isNativeHarness } from "./isNativeHarness"

describe("isNativeHarness", () => {
  it("returns true for the dev demo harness", () => {
    expect(isNativeHarness(HarnessIdSchema.parse("demo"))).toBe(true)
  })

  it("returns false for a terminal-backed harness", () => {
    expect(isNativeHarness(HarnessIdSchema.parse("claude"))).toBe(false)
  })

  it("returns false for an undefined harness id", () => {
    expect(isNativeHarness(undefined)).toBe(false)
  })
})
