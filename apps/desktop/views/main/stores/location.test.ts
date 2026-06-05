import { describe, expect, it } from "bun:test"
import { createFakeLocationAdapter } from "./location"

describe("createFakeLocationAdapter", () => {
  it("returns the seeded hash and reflects writes", () => {
    const loc = createFakeLocationAdapter("#sessions")
    expect(loc.readHash()).toBe("#sessions")
    loc.writeHash("#settings/providers")
    expect(loc.readHash()).toBe("#settings/providers")
    expect(loc.current()).toBe("#settings/providers")
  })

  it("defaults to an empty hash", () => {
    const loc = createFakeLocationAdapter()
    expect(loc.readHash()).toBe("")
  })
})
