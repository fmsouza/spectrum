import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto"
import { err, ok } from "@launchkit/utils"
import type { SecretError } from "./backend"
import type { SecretCipher } from "./cipher"

const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

const noPassphrase: SecretError = {
  kind: "unavailable",
  detail:
    "no secret passphrase available — set LAUNCHKIT_SECRET_PASSPHRASE or install a Secret Service keyring",
}

/**
 * AES-256-GCM with a scrypt key derived from a user passphrase. Envelope =
 * base64(salt | iv | tag | ciphertext). Used as the headless-Linux fallback when no Secret Service
 * is available. Never writes plaintext: with no passphrase, both ops return `unavailable`.
 */
export const createPassphraseAeadCipher = (deps: {
  readonly getPassphrase: () => Promise<string | null>
}): SecretCipher => ({
  encrypt: async (plaintext) => {
    const passphrase = await deps.getPassphrase()
    if (passphrase === null) return err(noPassphrase)
    const salt = randomBytes(SALT_LEN)
    const iv = randomBytes(IV_LEN)
    const key = scryptSync(passphrase, salt, KEY_LEN)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const tag = cipher.getAuthTag()
    return ok(Buffer.concat([salt, iv, tag, ct]).toString("base64"))
  },
  decrypt: async (envelope) => {
    const passphrase = await deps.getPassphrase()
    if (passphrase === null) return err(noPassphrase)
    try {
      const buf = Buffer.from(envelope, "base64")
      const salt = buf.subarray(0, SALT_LEN)
      const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN)
      const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN)
      const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN)
      const key = scryptSync(passphrase, salt, KEY_LEN)
      const decipher = createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(tag)
      const pt = Buffer.concat([decipher.update(ct), decipher.final()])
      return ok(pt.toString("utf8"))
    } catch {
      return err({
        kind: "backend-failed",
        detail: "decrypt failed (wrong passphrase or corrupt envelope)",
      })
    }
  },
})
