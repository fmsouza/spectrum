import type { IpcError, IpcMethods } from "@spectrum/ipc"
import type { ModelId, ModelRoute } from "@spectrum/types"
import type { Result } from "@spectrum/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import { sortModelRoutes } from "../model-sort"
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

export type ModelsStoreDeps = StoreDeps & {
  /** Resolves provider display names for ordering. Reads the live providers store on demand. */
  readonly providerNameResolver?: () => Readonly<Record<string, string>>
}

export const createModelsStore = (
  deps: ModelsStoreDeps,
): StoreApi<ModelsStore> =>
  createStore<ModelsStore>()((set, get) => ({
    ...createResource<readonly ModelRoute[]>(
      async () => {
        const r = await deps.client.getModels(undefined)
        if (!r.ok) return r
        const names = deps.providerNameResolver?.() ?? {}
        return { ok: true, value: sortModelRoutes(r.value, (id) => names[id]) }
      },
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
