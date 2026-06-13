import type { Result } from "@launchkit/utils"
import type { SecretError } from "./backend"

/** Encrypts/decrypts a single secret string to/from an opaque base64 envelope. */
export interface SecretCipher {
  encrypt(plaintext: string): Promise<Result<string, SecretError>>
  decrypt(envelope: string): Promise<Result<string, SecretError>>
}
