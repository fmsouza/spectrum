import { describe, expect, it } from "bun:test"
import type { HarnessId } from "@launchkit/types"
import { isNativeHarness } from "./isNativeHarness"

type H = { readonly id: string; readonly native: boolean }
const harnesses: readonly H[] = [
  { id: "claude", native: true },
  { id: "aider", native: false },
]

describe("isNativeHarness (data-driven)", () => {
  it("returns true for a harness flagged native in the loaded list", () => {
    expect(isNativeHarness("claude" as HarnessId, harnesses)).toBe(true)
  })

  it("returns false for a harness flagged non-native", () => {
    expect(isNativeHarness("aider" as HarnessId, harnesses)).toBe(false)
  })

  it("returns false for a harness absent from the list", () => {
    expect(isNativeHarness("ghost" as HarnessId, harnesses)).toBe(false)
  })

  it("returns false for an undefined harness id", () => {
    expect(isNativeHarness(undefined, harnesses)).toBe(false)
  })
})
