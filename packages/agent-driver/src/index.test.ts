import { describe, expect, it } from "bun:test"
import {
  AGENT_DRIVER_PACKAGE,
  createFakeDriver,
  createRunManager,
  decodeRunnerInbound,
  demoScript,
} from "./index"

describe("@launchkit/agent-driver barrel", () => {
  it("re-exports the package marker and the public factories", () => {
    expect(AGENT_DRIVER_PACKAGE).toBe("@launchkit/agent-driver")
    expect(typeof createFakeDriver).toBe("function")
    expect(typeof createRunManager).toBe("function")
    expect(typeof decodeRunnerInbound).toBe("function")
    expect(demoScript.reactions.length).toBeGreaterThan(0)
  })
})
