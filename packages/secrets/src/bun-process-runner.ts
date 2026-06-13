import { type Result, err, ok } from "@spectrum/utils"
import type { SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"

/**
 * Real `ProcessRunner` backed by `Bun.spawn`. The command and its args are passed
 * as a single argument array `[command, ...args]` — there is no shell, no string
 * interpolation, so secret arguments cannot be reinterpreted by a shell.
 */
export const createBunProcessRunner = (): ProcessRunner => ({
  run: async (
    command: string,
    args: readonly string[],
    opts?: { readonly stdin?: string },
  ): Promise<Result<{ stdout: string }, SecretError>> => {
    try {
      const proc = Bun.spawn([command, ...args], {
        ...(opts?.stdin !== undefined
          ? { stdin: new TextEncoder().encode(opts.stdin) }
          : {}),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (exitCode !== 0) {
        return err({
          kind: "backend-failed",
          detail: `exit ${exitCode}: ${stderr.trim()}`,
        })
      }
      return ok({ stdout })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "backend-failed", detail })
    }
  },
})
