import type { Platform } from "@launchkit/platform"
import { type KeychainBackend, createInMemoryKeychainBackend } from "./backend"
import { createDpapiCipher } from "./cipher-dpapi"
import { createPassphraseAeadCipher } from "./cipher-passphrase"
import { createEncryptedFileBackend } from "./encrypted-file-backend"
import { createMacosSecurityBackend } from "./macos-backend"
import type { ProcessRunner } from "./process-runner"
import type { SecretFileOps } from "./secret-file-ops"
import { isSecretServiceAvailable } from "./secret-service-probe"
import { createSecretToolBackend } from "./secret-tool-backend"

export interface PlatformKeychainDeps {
  readonly platform: Platform
  readonly runner: ProcessRunner
  readonly fileOps: SecretFileOps
  readonly secretsDir: string
  /**
   * Linux only — passphrase source for the encrypted-file fallback when no
   * Secret Service answers. Unused on macOS/Windows. May return `null`, in
   * which case Linux writes return `{ kind: "unavailable" }`.
   */
  readonly secretPassphrase: () => Promise<string | null>
  readonly commandExists?: (cmd: string) => boolean
}

/**
 * Linux: prefer `secret-tool` when a Secret Service answers, else the passphrase-encrypted file. The
 * probe is async, so it runs lazily (memoized) on first use — keeping the selector synchronous so
 * the synchronous `createAppContext` can call it.
 */
const createLinuxKeychainBackend = (
  deps: PlatformKeychainDeps,
): KeychainBackend => {
  let resolved: KeychainBackend | null = null
  let pending: Promise<KeychainBackend> | null = null
  const pick = (): Promise<KeychainBackend> => {
    if (resolved !== null) return Promise.resolve(resolved)
    if (pending !== null) return pending
    pending = (async () => {
      const available = await isSecretServiceAvailable(
        deps.commandExists === undefined
          ? { runner: deps.runner }
          : { runner: deps.runner, commandExists: deps.commandExists },
      )
      const next: KeychainBackend = available
        ? createSecretToolBackend({ runner: deps.runner })
        : createEncryptedFileBackend({
            fileOps: deps.fileOps,
            secretsDir: deps.secretsDir,
            cipher: createPassphraseAeadCipher({
              getPassphrase: deps.secretPassphrase,
            }),
          })
      resolved = next
      return next
    })()
    return pending
  }
  return {
    add: async (a, s) => (await pick()).add(a, s),
    find: async (a) => (await pick()).find(a),
    remove: async (a) => (await pick()).remove(a),
  }
}

/** Select the keychain backend for the given platform. Synchronous. */
export const createPlatformKeychainBackend = (
  deps: PlatformKeychainDeps,
): KeychainBackend => {
  switch (deps.platform) {
    case "macos":
      return createMacosSecurityBackend({ runner: deps.runner })
    case "linux":
      return createLinuxKeychainBackend(deps)
    case "windows":
      return createEncryptedFileBackend({
        fileOps: deps.fileOps,
        secretsDir: deps.secretsDir,
        cipher: createDpapiCipher({ runner: deps.runner }),
      })
    // `unknown` is a defensive default for future OS additions; never expected at runtime.
    default:
      return createInMemoryKeychainBackend()
  }
}
