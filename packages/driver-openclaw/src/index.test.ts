import { describe, expect, it } from "bun:test"
import { createOpenclawDriver, mapOpenclawEvent } from "./index"

describe("@spectrum/driver-openclaw barrel", () => {
  it("exports createOpenclawDriver and the pure mapOpenclawEvent", () => {
    expect(typeof createOpenclawDriver).toBe("function")
    expect(typeof mapOpenclawEvent).toBe("function")
  })
})
