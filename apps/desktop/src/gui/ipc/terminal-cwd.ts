import type { TerminalError } from "@spectrum/pty"
import type { SessionId } from "@spectrum/types"
import type { Result } from "@spectrum/utils"

export interface ResolveTerminalCwdInput {
  readonly sessionId: SessionId
  readonly sessionCwd: string | undefined
  readonly projectPath: string | undefined
  readonly homeDir: string
  readonly exists: (path: string) => Promise<boolean>
}

/**
 * Pure resolver: session.cwd → project path → home dir, with an fs.exists check at each step.
 * Returns the first candidate that exists; a `cwd-missing` Result if none do. Effects only through
 * the injected `exists` (testable).
 */
export const resolveTerminalCwd = async (
  input: ResolveTerminalCwdInput,
): Promise<Result<{ cwd: string }, TerminalError>> => {
  const candidates = [
    input.sessionCwd,
    input.projectPath,
    input.homeDir,
  ].filter((p): p is string => typeof p === "string" && p.length > 0)
  for (const path of candidates) {
    if (await input.exists(path)) return { ok: true, value: { cwd: path } }
  }
  return {
    ok: false,
    error: { kind: "cwd-missing", path: candidates[0] ?? input.homeDir },
  }
}
