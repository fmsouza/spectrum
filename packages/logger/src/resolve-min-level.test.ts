import { describe, expect, it } from "bun:test"
import { resolveMinLevel } from "./resolve-min-level"

describe("resolveMinLevel", () => {
  it("defaults to debug in development", () => {
    expect(resolveMinLevel("development", {})).toBe("debug")
  })
  it("defaults to info in production", () => {
    expect(resolveMinLevel("production", {})).toBe("info")
  })
  it("honors a valid SPECTRUM_LOG_LEVEL override", () => {
    expect(resolveMinLevel("production", { SPECTRUM_LOG_LEVEL: "warn" })).toBe(
      "warn",
    )
  })
  it("ignores an invalid override and falls back to the env default", () => {
    expect(resolveMinLevel("development", { SPECTRUM_LOG_LEVEL: "loud" })).toBe(
      "debug",
    )
  })
})
