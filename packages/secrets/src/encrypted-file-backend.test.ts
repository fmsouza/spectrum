import { describe, expect, it } from "bun:test"
import { err, ok } from "@launchkit/utils"
import type { SecretCipher } from "./cipher"
import { createEncryptedFileBackend } from "./encrypted-file-backend"
import { createInMemorySecretFileOps } from "./secret-file-ops"

const fakeCipher: SecretCipher = {
  encrypt: async (p) => ok(`enc(${p})`),
  decrypt: async (e) => ok(e.replace(/^enc\(/, "").replace(/\)$/, "")),
}
const unavailableCipher: SecretCipher = {
  encrypt: async () => err({ kind: "unavailable", detail: "no passphrase" }),
  decrypt: async () => err({ kind: "unavailable", detail: "no passphrase" }),
}

describe("createEncryptedFileBackend", () => {
  it("round-trips a secret through add then find via the cipher and file ops", async () => {
    const backend = createEncryptedFileBackend({
      fileOps: createInMemorySecretFileOps(),
      secretsDir: "/data/secrets",
      cipher: fakeCipher,
    })
    expect((await backend.add("kc_1", "sk-secret")).ok).toBe(true)
    expect(await backend.find("kc_1")).toEqual({ ok: true, value: "sk-secret" })
  })

  it("returns not-found when find is called for an account that was never stored", async () => {
    const backend = createEncryptedFileBackend({
      fileOps: createInMemorySecretFileOps(),
      secretsDir: "/data/secrets",
      cipher: fakeCipher,
    })
    expect(await backend.find("missing")).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("reports not-found after remove", async () => {
    const fileOps = createInMemorySecretFileOps()
    const backend = createEncryptedFileBackend({ fileOps, secretsDir: "/d", cipher: fakeCipher })
    await backend.add("kc_1", "x")
    expect((await backend.remove("kc_1")).ok).toBe(true)
    expect((await backend.find("kc_1")).ok).toBe(false)
  })

  it("propagates the cipher 'unavailable' error and writes nothing when no passphrase exists", async () => {
    const fileOps = createInMemorySecretFileOps()
    const backend = createEncryptedFileBackend({ fileOps, secretsDir: "/d", cipher: unavailableCipher })
    const r = await backend.add("kc_1", "x")
    expect(r).toEqual({ ok: false, error: { kind: "unavailable", detail: "no passphrase" } })
    expect(await fileOps.exists("/d")).toBe(false)
  })
})
