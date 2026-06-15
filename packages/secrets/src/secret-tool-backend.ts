import { err, isOk, ok, redactSecrets } from "@spectrum/utils"
import type { KeychainBackend, SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"

const redactError = (
  error: SecretError,
  secrets: readonly string[],
): SecretError =>
  error.kind === "backend-failed"
    ? { kind: "backend-failed", detail: redactSecrets(error.detail, secrets) }
    : error

/**
 * Linux keychain backend over libsecret's `secret-tool` (Secret Service / D-Bus). The secret is fed
 * on stdin (never argv). The service name defaults to `"spectrum"`; dev wiring passes `"spectrum-dev"`.
 */
export const createSecretToolBackend = (deps: {
  readonly runner: ProcessRunner
  /** Secret Service namespace. Defaults to "spectrum"; dev wiring passes "spectrum-dev". */
  readonly service?: string
}): KeychainBackend => {
  const { runner } = deps
  const service = deps.service ?? "spectrum"
  return {
    add: async (account, secret) => {
      const result = await runner.run(
        "secret-tool",
        [
          "store",
          `--label=Spectrum: ${account}`,
          "service",
          service,
          "account",
          account,
        ],
        { stdin: secret },
      )
      return isOk(result)
        ? ok(undefined)
        : err(redactError(result.error, [secret]))
    },
    find: async (account) => {
      const result = await runner.run("secret-tool", [
        "lookup",
        "service",
        service,
        "account",
        account,
      ])
      // `secret-tool lookup` exits non-zero when the item is absent — treat any failure as not-found.
      if (!isOk(result)) return err({ kind: "not-found" })
      return ok(result.value.stdout.replace(/\n$/, ""))
    },
    remove: async (account) => {
      const result = await runner.run("secret-tool", [
        "clear",
        "service",
        service,
        "account",
        account,
      ])
      return isOk(result) ? ok(undefined) : err(result.error)
    },
  }
}
