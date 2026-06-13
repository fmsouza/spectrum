import type { Result } from "@launchkit/utils"
import type { SecretError } from "./backend"

/**
 * The process-spawn effect for the real keychain backend. `command` + `args` are passed as an
 * argument array — never joined into a shell string. `opts.stdin`, when provided, is written to the
 * child's stdin (used to pass secrets to `secret-tool` / PowerShell WITHOUT putting them on argv).
 */
export interface ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    opts?: { readonly stdin?: string },
  ): Promise<Result<{ stdout: string }, SecretError>>
}
