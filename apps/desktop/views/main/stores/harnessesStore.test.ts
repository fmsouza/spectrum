import { describe, expect, it, mock } from "bun:test"
import type { HarnessView } from "@launchkit/ipc"
import { createFakeIpcClient } from "../test/fake-client"
import { createHarnessesStore } from "./harnessesStore"

const def: HarnessView = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {},
  builtIn: true,
  native: false,
}

describe("createHarnessesStore", () => {
  it("loads harness definitions via fetch", async () => {
    const store = createHarnessesStore({
      client: createFakeIpcClient({
        getHarnesses: async () => ({ ok: true, value: [def] }),
      }),
    })
    await store.getState().fetch()
    expect(store.getState().data).toEqual([def])
  })

  it("add calls addHarness then invalidates", async () => {
    const getHarnesses = mock(async () => ({ ok: true as const, value: [def] }))
    const client = createFakeIpcClient({
      getHarnesses,
      addHarness: async () => ({ ok: true as const, value: def }),
    })
    const store = createHarnessesStore({ client })
    await store.getState().fetch()
    await store.getState().add(def)
    expect(client.calls.addHarness.length).toBe(1)
    expect(getHarnesses).toHaveBeenCalledTimes(2)
  })

  it("remove calls deleteHarness then invalidates", async () => {
    const getHarnesses = mock(async () => ({ ok: true as const, value: [def] }))
    const client = createFakeIpcClient({
      getHarnesses,
      deleteHarness: async () => ({ ok: true as const, value: null }),
    })
    const store = createHarnessesStore({ client })
    await store.getState().fetch()
    await store.getState().remove("claude")
    expect(client.calls.deleteHarness[0]).toMatchObject({ id: "claude" })
    expect(getHarnesses).toHaveBeenCalledTimes(2)
  })
})
