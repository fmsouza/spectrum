import { describe, expect, it } from "bun:test"
import { AGENT_DRIVER_PACKAGE } from "./index"

describe("@launchkit/agent-driver barrel", () => {
  it("exposes the package marker when imported", () => {
    expect(AGENT_DRIVER_PACKAGE).toBe("@launchkit/agent-driver")
  })
})
