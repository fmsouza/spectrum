import type { PermissionMode } from "@spectrum/agent-events"
import type { AskForApproval } from "./bindings/v2/AskForApproval"
import type { SandboxPolicy } from "./bindings/v2/SandboxPolicy"

export const CODEX_SUPPORTED_MODES: readonly PermissionMode[] = [
  "manual",
  "auto-edits",
  "bypass",
]

export type CodexTurnPolicy = {
  readonly approvalPolicy: AskForApproval
  readonly sandboxPolicy?: SandboxPolicy
}

// Record (not a ternary chain) so adding a PermissionMode fails the build here.
// "plan" never reaches a codex run (not in CODEX_SUPPORTED_MODES) — mapped to manual defensively.
const TURN_POLICY: Record<PermissionMode, CodexTurnPolicy> = {
  manual: { approvalPolicy: "untrusted" },
  plan: { approvalPolicy: "untrusted" },
  "auto-edits": {
    approvalPolicy: "on-failure",
    sandboxPolicy: {
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
  },
  bypass: {
    approvalPolicy: "never",
    sandboxPolicy: { type: "dangerFullAccess" },
  },
}

/** Normalized mode → turn/start policy overrides (persist for subsequent turns). PURE. */
export const toCodexTurnPolicy = (mode: PermissionMode): CodexTurnPolicy =>
  TURN_POLICY[mode]
