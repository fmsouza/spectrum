import { describe, expect, it } from "bun:test"
import * as secrets from "./index"

describe("@spectrum/secrets barrel", () => {
  it("exports every public factory when imported", () => {
    for (const name of [
      "createSecretStore",
      "createInMemoryKeychainBackend",
      "createMacosSecurityBackend",
      "createBunProcessRunner",
    ]) {
      expect(secrets).toHaveProperty(name)
    }
  })

  it("wires an end-to-end set/get round-trip through the in-memory backend from the barrel", async () => {
    const backend = secrets.createInMemoryKeychainBackend()
    const idGen = { next: (prefix: string) => `${prefix}_fixed` }
    const store = secrets.createSecretStore({ backend, idGen })

    const set = await store.set("sk-secret")
    expect(set).toEqual({ ok: true, value: { ref: "kc_fixed" } })

    const got = await store.get({ ref: "kc_fixed" })
    expect(got).toEqual({ ok: true, value: "sk-secret" })
  })
})
