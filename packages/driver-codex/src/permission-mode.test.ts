import { describe, expect, it } from "bun:test"
import { CODEX_SUPPORTED_MODES, toCodexTurnPolicy } from "./permission-mode"

describe("toCodexTurnPolicy", () => {
  it("maps manual to untrusted approvals with no sandbox override", () => {
    expect(toCodexTurnPolicy("manual")).toEqual({ approvalPolicy: "untrusted" })
  })

  it("maps auto-edits to on-failure approvals in a workspace-write sandbox", () => {
    expect(toCodexTurnPolicy("auto-edits")).toEqual({
      approvalPolicy: "on-failure",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    })
  })

  it("maps bypass to never-ask with full access", () => {
    expect(toCodexTurnPolicy("bypass")).toEqual({
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" },
    })
  })

  it("falls back to manual for plan (never offered for codex)", () => {
    expect(toCodexTurnPolicy("plan")).toEqual({ approvalPolicy: "untrusted" })
  })

  it("does not declare plan supported", () => {
    expect(CODEX_SUPPORTED_MODES).toEqual(["manual", "auto-edits", "bypass"])
  })
})
