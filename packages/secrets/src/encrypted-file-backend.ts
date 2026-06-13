import { createHash } from "node:crypto"
import { join } from "node:path"
import type { KeychainBackend } from "./backend"
import type { SecretCipher } from "./cipher"
import type { SecretFileOps } from "./secret-file-ops"

/**
 * Keychain backend storing one encrypted file per account: `<secretsDir>/<sha256(account)>.enc`.
 * Cipher-parameterized — DPAPI on Windows, passphrase-AEAD as the headless-Linux fallback. The
 * account is hashed (never used verbatim as a filename).
 */
export const createEncryptedFileBackend = (deps: {
  readonly fileOps: SecretFileOps
  readonly secretsDir: string
  readonly cipher: SecretCipher
}): KeychainBackend => {
  const fileFor = (account: string): string =>
    join(
      deps.secretsDir,
      `${createHash("sha256").update(account).digest("hex")}.enc`,
    )
  return {
    add: async (account, secret) => {
      const enc = await deps.cipher.encrypt(secret)
      if (!enc.ok) return enc
      return deps.fileOps.write(fileFor(account), enc.value)
    },
    find: async (account) => {
      const read = await deps.fileOps.read(fileFor(account))
      if (!read.ok) return read
      return deps.cipher.decrypt(read.value)
    },
    remove: async (account) => deps.fileOps.remove(fileFor(account)),
  }
}
