import type { PermissionMode } from "@launchkit/agent-events"

export const CLAUDE_SUPPORTED_MODES: readonly PermissionMode[] = [
  "manual",
  "auto-edits",
  "plan",
  "bypass",
]

/** Normalized LaunchKit mode → the Claude Agent SDK `permissionMode` string. PURE. */
export const toClaudePermissionMode = (mode: PermissionMode): string =>
  mode === "auto-edits"
    ? "acceptEdits"
    : mode === "plan"
      ? "plan"
      : mode === "bypass"
        ? "bypassPermissions"
        : "default"
