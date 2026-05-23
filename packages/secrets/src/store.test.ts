import { describe, it, expect } from "bun:test"
import { createSequentialIdGen } from "@launchkit/utils"
import { createInMemoryKeychainBackend } from "./backend"
import { createSecretStore } from "./store"

const makeStore = () => {
  const backend = createInMemoryKeychainBackend()
  const idGen = createSequentialIdGen()
  return { backend, store: createSecretStore({ backend, idGen }) }
}

describe("createSecretStore", () => {
  it("mints a kc-prefixed ref via the IdGen and returns it when set is called", async () => {
    const { store } = makeStore()
    const result = await store.set("sk-secret")
    expect(result).toEqual({ ok: true, value: { ref: "kc_1" } })
  })

  it("stores the value under the minted ref so get returns it", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    expect(set.ok).toBe(true)
    if (!set.ok) return

    const got = await store.get(set.value)
    expect(got).toEqual({ ok: true, value: "sk-secret" })
  })

  it("uses a fresh ref for each set so two secrets do not collide", async () => {
    const { store } = makeStore()
    const a = await store.set("secret-a")
    const b = await store.set("secret-b")
    expect(a).toEqual({ ok: true, value: { ref: "kc_1" } })
    expect(b).toEqual({ ok: true, value: { ref: "kc_2" } })
  })

  it("returns a not-found error when get is called for a ref that was never set", async () => {
    const { store } = makeStore()
    const got = await store.get({ ref: "kc_999" })
    expect(got).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("deletes the secret so a later get returns not-found", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    if (!set.ok) return

    const deleted = await store.delete(set.value)
    expect(deleted).toEqual({ ok: true, value: undefined })

    const got = await store.get(set.value)
    expect(got).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("reports true from has when the ref exists and false otherwise", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    if (!set.ok) return

    expect(await store.has(set.value)).toBe(true)
    expect(await store.has({ ref: "kc_absent" })).toBe(false)
  })
})
