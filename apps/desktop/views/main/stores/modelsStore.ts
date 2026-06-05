import type { IpcError, IpcMethods } from "@launchkit/ipc"
import type { ModelId, ModelRoute } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addModel"]["params"]
type UpdateInput = IpcMethods["updateModel"]["params"]["input"]

export type ModelsStore = ResourceState<readonly ModelRoute[]> & {
  readonly add: (input: AddInput) => Promise<Result<void, IpcError>>
  readonly update: (
    id: ModelId,
    input: UpdateInput,
  ) => Promise<Result<void, IpcError>>
  readonly remove: (id: ModelId) => Promise<Result<void, IpcError>>
}

export const createModelsStore = (deps: StoreDeps): StoreApi<ModelsStore> =>
  createStore<ModelsStore>()((set, get) => ({
    ...createResource<readonly ModelRoute[]>(
      () => deps.client.getModels(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.addModel(input)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    update: async (id, input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.updateModel({ id, input })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    remove: async (id): Promise<Result<void, IpcError>> => {
      const r = await deps.client.deleteModel({ id })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
  }))
