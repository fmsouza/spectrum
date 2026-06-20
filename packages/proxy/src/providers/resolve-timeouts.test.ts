import { describe, expect, it } from "bun:test"
import { resolveTimeouts } from "./resolve-timeouts"

describe("resolveTimeouts", () => {
  const settings = { firstTokenTimeoutMs: 120_000, interTokenTimeoutMs: 60_000 }

  it("passes incremental-provider settings through unchanged", () => {
    expect(resolveTimeouts("incremental", settings)).toEqual(settings)
  })

  it("raises buffered-provider windows to the generous floor", () => {
    expect(resolveTimeouts("buffered", settings)).toEqual({
      firstTokenTimeoutMs: 600_000,
      interTokenTimeoutMs: 600_000,
    })
  })

  it("never lowers a window the user set above the buffered floor", () => {
    const high = { firstTokenTimeoutMs: 600_000, interTokenTimeoutMs: 600_000 }
    expect(resolveTimeouts("buffered", high)).toEqual(high)
  })

  it("keeps a user value already above the floor for incremental", () => {
    const high = { firstTokenTimeoutMs: 300_000, interTokenTimeoutMs: 300_000 }
    expect(resolveTimeouts("incremental", high)).toEqual(high)
  })
})
