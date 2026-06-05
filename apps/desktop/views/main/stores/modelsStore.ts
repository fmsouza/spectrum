import type { IpcMethods } from "@launchkit/ipc"
import type { ModelId, ModelRoute } from "@launchkit/types"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addModel"]["params"]
type UpdateInput = IpcMethods["updateModel"]["params"]["input"]

export type ModelsStore = ResourceState<readonly ModelRoute[]> & {
  readonly add: (input: AddInput) => Promise<void>
  readonly update: (id: ModelId, input: UpdateInput) => Promise<void>
  readonly remove: (id: ModelId) => Promise<void>
}

export const createModelsStore = (deps: StoreDeps): StoreApi<ModelsStore> =>
  createStore<ModelsStore>()((set, get) => ({
    ...createResource<readonly ModelRoute[]>(
      () => deps.client.getModels(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input) => {
      const r = await deps.client.addModel(input)
      if (r.ok) await get().invalidate()
    },
    update: async (id, input) => {
      const r = await deps.client.updateModel({ id, input })
      if (r.ok) await get().invalidate()
    },
    remove: async (id) => {
      const r = await deps.client.deleteModel({ id })
      if (r.ok) await get().invalidate()
    },
  }))
