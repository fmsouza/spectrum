import { describe, expect, it } from "bun:test"
import {
  AGENT_DRIVER_PACKAGE,
  createFakeDriver,
  createRunManager,
  decodeRunnerInbound,
  demoScript,
} from "./index"

describe("@spectrum/agent-driver barrel", () => {
  it("re-exports the package marker and the public factories", () => {
    expect(AGENT_DRIVER_PACKAGE).toBe("@spectrum/agent-driver")
    expect(typeof createFakeDriver).toBe("function")
    expect(typeof createRunManager).toBe("function")
    expect(typeof decodeRunnerInbound).toBe("function")
    expect(demoScript.reactions.length).toBeGreaterThan(0)
  })
})
