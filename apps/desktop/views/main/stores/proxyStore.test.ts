import { describe, expect, it, mock } from "bun:test"
import { createFakeIpcClient } from "../test/fake-client"
import { createProxyStore } from "./proxyStore"

describe("createProxyStore", () => {
  it("starts empty", () => {
    const store = createProxyStore({ client: createFakeIpcClient({}) })
    const s = store.getState()
    expect(s.data).toBeUndefined()
    expect(s.loading).toBe(false)
  })

  it("loads proxy status via fetch", async () => {
    const store = createProxyStore({
      client: createFakeIpcClient({
        getProxyStatus: async () => ({
          ok: true,
          value: { running: true, port: 4000 },
        }),
      }),
    })
    await store.getState().fetch()
    expect(store.getState().data).toEqual({ running: true, port: 4000 })
  })

  it("invalidate refetches even when already loaded", async () => {
    const getProxyStatus = mock(async () => ({
      ok: true as const,
      value: { running: false, port: 1 },
    }))
    const store = createProxyStore({
      client: createFakeIpcClient({ getProxyStatus }),
    })
    await store.getState().fetch()
    await store.getState().invalidate()
    expect(getProxyStatus).toHaveBeenCalledTimes(2)
  })
})
