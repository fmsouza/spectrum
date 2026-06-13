import { describe, expect, it } from "bun:test"
import { DRIVER_CLAUDE_PACKAGE } from "./index"

describe("@spectrum/driver-claude barrel", () => {
  it("exports its package marker", () => {
    expect(DRIVER_CLAUDE_PACKAGE).toBe("@spectrum/driver-claude")
  })
})
