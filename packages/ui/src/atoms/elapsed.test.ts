import { describe, expect, it } from "bun:test"
import { elapsedSecondsFrom } from "./elapsed"

describe("elapsedSecondsFrom", () => {
  it("returns undefined before the minimum visible threshold", () => {
    expect(elapsedSecondsFrom(1000, 2999, 3)).toBeUndefined()
  })
  it("returns whole seconds once past the threshold", () => {
    expect(elapsedSecondsFrom(1000, 4200, 3)).toBe(3)
    expect(elapsedSecondsFrom(0, 45_900, 3)).toBe(45)
  })
  it("returns the exact threshold value when elapsed seconds equals minVisibleSeconds (>= boundary)", () => {
    // Exactly 3 seconds elapsed at minVisibleSeconds=3: the >= check must include the boundary.
    expect(elapsedSecondsFrom(1000, 4000, 3)).toBe(3)
  })
})
