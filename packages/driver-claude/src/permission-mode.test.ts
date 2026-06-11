import { describe, expect, it } from "bun:test"
import {
  CLAUDE_SUPPORTED_MODES,
  toClaudePermissionMode,
} from "./permission-mode"

describe("toClaudePermissionMode", () => {
  it("maps every normalized mode to the SDK's native string", () => {
    expect(toClaudePermissionMode("manual")).toBe("default")
    expect(toClaudePermissionMode("auto-edits")).toBe("acceptEdits")
    expect(toClaudePermissionMode("plan")).toBe("plan")
    expect(toClaudePermissionMode("bypass")).toBe("bypassPermissions")
  })

  it("declares all four modes supported", () => {
    expect(CLAUDE_SUPPORTED_MODES).toEqual([
      "manual",
      "auto-edits",
      "plan",
      "bypass",
    ])
  })
})
