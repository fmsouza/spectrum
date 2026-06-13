import { err, isOk, ok, redactSecrets } from "@spectrum/utils"
import type { KeychainBackend, SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"

const SERVICE = "spectrum"

const redactError = (
  error: SecretError,
  secrets: readonly string[],
): SecretError =>
  error.kind === "backend-failed"
    ? { kind: "backend-failed", detail: redactSecrets(error.detail, secrets) }
    : error

/**
 * Linux keychain backend over libsecret's `secret-tool` (Secret Service / D-Bus). The secret is fed
 * on stdin (never argv). The service name is always `"spectrum"`, matching every other backend.
 */
export const createSecretToolBackend = (deps: {
  readonly runner: ProcessRunner
}): KeychainBackend => {
  const { runner } = deps
  return {
    add: async (account, secret) => {
      const result = await runner.run(
        "secret-tool",
        [
          "store",
          `--label=Spectrum: ${account}`,
          "service",
          SERVICE,
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
        SERVICE,
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
        SERVICE,
        "account",
        account,
      ])
      return isOk(result) ? ok(undefined) : err(result.error)
    },
  }
}
