import { describe, expect, it } from "bun:test"
import * as agentEvents from "./index"

describe("@launchkit/agent-events barrel", () => {
  it("exports the reduce reducer and initialRunState when imported", () => {
    expect(typeof agentEvents.reduce).toBe("function")
    expect(agentEvents.initialRunState).toEqual({ runners: new Map() })
  })

  it("exports the CanonicalEventSchema and StoredEventSchema when imported", () => {
    expect(typeof agentEvents.CanonicalEventSchema.parse).toBe("function")
    expect(typeof agentEvents.StoredEventSchema.parse).toBe("function")
  })

  it("exports PermissionModeSchema when imported", () => {
    expect(typeof agentEvents.PermissionModeSchema.parse).toBe("function")
  })
})
