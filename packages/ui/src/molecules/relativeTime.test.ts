import { describe, expect, it } from "bun:test"
import { relativeTime } from "./relativeTime"

const base = Date.parse("2026-06-04T12:00:00.000Z")

describe("relativeTime", () => {
  it("returns 'just now' for timestamps under a minute old", () => {
    expect(relativeTime("2026-06-04T11:59:30.000Z", base)).toBe("just now")
  })
  it("returns whole minutes for sub-hour ages", () => {
    expect(relativeTime("2026-06-04T11:45:00.000Z", base)).toBe("15m ago")
  })
  it("returns whole hours for sub-day ages", () => {
    expect(relativeTime("2026-06-04T09:00:00.000Z", base)).toBe("3h ago")
  })
  it("returns whole days for older timestamps", () => {
    expect(relativeTime("2026-06-02T12:00:00.000Z", base)).toBe("2d ago")
  })
  it("treats future timestamps as 'just now'", () => {
    expect(relativeTime("2026-06-04T12:05:00.000Z", base)).toBe("just now")
  })
})
