import { describe, expect, it } from "bun:test"
import { createOpencodeDriver, mapOpencodeEvent } from "./index"

describe("@launchkit/driver-opencode barrel", () => {
  it("exports createOpencodeDriver and the pure mapOpencodeEvent", () => {
    expect(typeof createOpencodeDriver).toBe("function")
    expect(typeof mapOpencodeEvent).toBe("function")
  })
})
