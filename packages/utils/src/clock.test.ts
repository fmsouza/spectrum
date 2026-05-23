import { describe, it, expect } from "bun:test"
import { createSystemClock, createFixedClock } from "./clock"

describe("createFixedClock", () => {
  it("returns the configured instant whenever now() is called", () => {
    const clock = createFixedClock(new Date("2026-05-23T00:00:00.000Z"))
    expect(clock.now().toISOString()).toBe("2026-05-23T00:00:00.000Z")
  })
})
describe("createSystemClock", () => {
  it("returns a Date close to the real time when now() is called", () => {
    const before = Date.now()
    const t = createSystemClock().now().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
  })
})
