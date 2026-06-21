import { describe, expect, it } from "bun:test"
import { formatElapsed } from "./format-elapsed"

describe("formatElapsed", () => {
  it("formats whole seconds under a minute as <n>s", () => {
    expect(formatElapsed(0)).toBe("0s")
    expect(formatElapsed(45)).toBe("45s")
    expect(formatElapsed(59)).toBe("59s")
  })

  it("formats minutes with seconds once past 59s (zero seconds shown)", () => {
    expect(formatElapsed(60)).toBe("1m 0s")
    expect(formatElapsed(133)).toBe("2m 13s")
    expect(formatElapsed(3599)).toBe("59m 59s")
  })

  it("formats hours with minutes and seconds once past 3599s (zero parts shown)", () => {
    expect(formatElapsed(3600)).toBe("1h 0m 0s")
    expect(formatElapsed(3661)).toBe("1h 1m 1s")
    expect(formatElapsed(3912)).toBe("1h 5m 12s")
    expect(formatElapsed(7325)).toBe("2h 2m 5s")
  })

  it("falls back to 0s for non-finite or negative input", () => {
    expect(formatElapsed(Number.NaN)).toBe("0s")
    expect(formatElapsed(-10)).toBe("0s")
    expect(Number.POSITIVE_INFINITY).not.toBe(0) // sanity: guard below handles this
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0s")
  })
})
