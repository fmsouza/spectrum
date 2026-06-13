import type { PermissionMode } from "@spectrum/agent-events"

export const CLAUDE_SUPPORTED_MODES: readonly PermissionMode[] = [
  "manual",
  "auto-edits",
  "plan",
  "bypass",
]

// Record (not a ternary chain) so adding a PermissionMode fails the build here.
const SDK_MODE: Record<PermissionMode, string> = {
  manual: "default",
  "auto-edits": "acceptEdits",
  plan: "plan",
  bypass: "bypassPermissions",
}

/** Normalized Spectrum mode → the Claude Agent SDK `permissionMode` string. PURE. */
export const toClaudePermissionMode = (mode: PermissionMode): string =>
  SDK_MODE[mode]
