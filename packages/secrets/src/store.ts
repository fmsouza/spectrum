import { type Logger, createNoopLogger } from "@spectrum/logger"
import type { SecretRef } from "@spectrum/types"
import { type IdGen, type Result, isOk, ok } from "@spectrum/utils"
import type { KeychainBackend, SecretError } from "./backend"

/**
 * Persists secret values in the keychain and hands back opaque `SecretRef`s.
 * `config.json` stores only these refs — never the raw value.
 */
export interface SecretStore {
  /** Mint a new ref, store `value` under it, return the ref. */
  set(value: string): Promise<Result<SecretRef, SecretError>>
  get(ref: SecretRef): Promise<Result<string, SecretError>>
  delete(ref: SecretRef): Promise<Result<void, SecretError>>
  has(ref: SecretRef): Promise<boolean>
}

export const createSecretStore = (deps: {
  readonly backend: KeychainBackend
  readonly idGen: IdGen
  readonly logger?: Logger
}): SecretStore => {
  const { backend, idGen } = deps
  const logger = deps.logger ?? createNoopLogger()

  /**
   * Observe backend op failures. SECURITY: only the non-sensitive `op` label and
   * the error `kind` enum are ever logged — never the secret value, the ref, or
   * the error `detail` (which can echo CLI output). Logging is observation only;
   * the `Result` returned by the caller is the sole control-flow signal.
   */
  const observe =
    <T>(op: "add" | "find" | "remove") =>
    (result: Result<T, SecretError>): Result<T, SecretError> => {
      if (
        !isOk(result) &&
        (result.error.kind === "backend-failed" ||
          result.error.kind === "unavailable")
      ) {
        logger.warn("keychain op failed", { op, kind: result.error.kind })
      }
      return result
    }

  return {
    set: async (value) => {
      const ref = idGen.next("kc")
      const added = observe<void>("add")(await backend.add(ref, value))
      return isOk(added) ? ok({ ref }) : added
    },
    get: async (ref) => observe<string>("find")(await backend.find(ref.ref)),
    delete: async (ref) =>
      observe<void>("remove")(await backend.remove(ref.ref)),
    has: async (ref) => isOk(await backend.find(ref.ref)),
  }
}
