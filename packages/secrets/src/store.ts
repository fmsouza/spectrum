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
}): SecretStore => {
  const { backend, idGen } = deps
  return {
    set: async (value) => {
      const ref = idGen.next("kc")
      const added = await backend.add(ref, value)
      return isOk(added) ? ok({ ref }) : added
    },
    get: (ref) => backend.find(ref.ref),
    delete: (ref) => backend.remove(ref.ref),
    has: async (ref) => isOk(await backend.find(ref.ref)),
  }
}
