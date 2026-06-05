import { describe, expect, it, mock } from "bun:test"
import type { ModelRoute } from "@launchkit/types"
import { createFakeIpcClient } from "../test/fake-client"
import { createModelsStore } from "./modelsStore"

const route = {
  id: "m_1",
  providerId: "p_openai",
  providerModel: "gpt-4o",
} as ModelRoute

describe("createModelsStore", () => {
  it("loads model routes via fetch", async () => {
    const store = createModelsStore({
      client: createFakeIpcClient({
        getModels: async () => ({ ok: true, value: [route] }),
      }),
    })
    await store.getState().fetch()
    expect(store.getState().data).toEqual([route])
  })

  it("add calls addModel then invalidates", async () => {
    const getModels = mock(async () => ({ ok: true as const, value: [route] }))
    const client = createFakeIpcClient({
      getModels,
      addModel: async () => ({ ok: true as const, value: route }),
    })
    const store = createModelsStore({ client })
    await store.getState().fetch()
    await store
      .getState()
      .add({ providerId: "p_openai", providerModel: "gpt-4o" })
    expect(client.calls.addModel.length).toBe(1)
    expect(getModels).toHaveBeenCalledTimes(2)
  })

  it("remove calls deleteModel then invalidates", async () => {
    const getModels = mock(async () => ({ ok: true as const, value: [route] }))
    const client = createFakeIpcClient({
      getModels,
      deleteModel: async () => ({ ok: true as const, value: null }),
    })
    const store = createModelsStore({ client })
    await store.getState().fetch()
    await store.getState().remove("m_1")
    expect(client.calls.deleteModel[0]).toMatchObject({ id: "m_1" })
    expect(getModels).toHaveBeenCalledTimes(2)
  })
})
