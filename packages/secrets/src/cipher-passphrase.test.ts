import { describe, expect, it } from "bun:test"
import { createPassphraseAeadCipher } from "./cipher-passphrase"

const withPass = (p: string | null) => () => Promise.resolve(p)

describe("createPassphraseAeadCipher", () => {
  it("round-trips a secret through encrypt then decrypt with the same passphrase", async () => {
    const cipher = createPassphraseAeadCipher({
      getPassphrase: withPass("hunter2"),
    })
    const enc = await cipher.encrypt("sk-secret-123")
    expect(enc.ok).toBe(true)
    if (!enc.ok) return
    expect(enc.value).not.toContain("sk-secret-123") // envelope is not plaintext
    expect(await cipher.decrypt(enc.value)).toEqual({
      ok: true,
      value: "sk-secret-123",
    })
  })

  it("fails to decrypt with a different passphrase (backend-failed, not the secret)", async () => {
    const enc = await createPassphraseAeadCipher({
      getPassphrase: withPass("right"),
    }).encrypt("sk-x")
    expect(enc.ok).toBe(true)
    if (!enc.ok) return
    const wrong = createPassphraseAeadCipher({
      getPassphrase: withPass("wrong"),
    })
    const dec = await wrong.decrypt(enc.value)
    expect(dec.ok).toBe(false)
  })

  it("returns 'unavailable' on encrypt when no passphrase is configured", async () => {
    const cipher = createPassphraseAeadCipher({ getPassphrase: withPass(null) })
    const enc = await cipher.encrypt("sk-x")
    expect(enc).toEqual({
      ok: false,
      error: {
        kind: "unavailable",
        detail: expect.stringContaining("LAUNCHKIT_SECRET_PASSPHRASE"),
      },
    })
  })
})
