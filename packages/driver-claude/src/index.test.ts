import { describe, expect, it } from "bun:test"
import { DRIVER_CLAUDE_PACKAGE } from "./index"

describe("@launchkit/driver-claude barrel", () => {
  it("exports its package marker", () => {
    expect(DRIVER_CLAUDE_PACKAGE).toBe("@launchkit/driver-claude")
  })
})
