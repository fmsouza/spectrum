import type { IpcError, IpcMethods, ProviderView } from "@launchkit/ipc"
import type { ProviderId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addProvider"]["params"]
type UpdateInput = IpcMethods["updateProvider"]["params"]["input"]
type SetSecretInput = IpcMethods["setProviderSecret"]["params"]

export type ProvidersStore = ResourceState<readonly ProviderView[]> & {
  readonly add: (input: AddInput) => Promise<Result<void, IpcError>>
  readonly update: (
    id: ProviderId,
    input: UpdateInput,
  ) => Promise<Result<void, IpcError>>
  readonly remove: (id: ProviderId) => Promise<Result<void, IpcError>>
  readonly setSecret: (input: SetSecretInput) => Promise<Result<void, IpcError>>
}

export const createProvidersStore = (
  deps: StoreDeps,
): StoreApi<ProvidersStore> =>
  createStore<ProvidersStore>()((set, get) => ({
    ...createResource<readonly ProviderView[]>(
      () => deps.client.getProviders(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.addProvider(input)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    update: async (id, input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.updateProvider({ id, input })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    remove: async (id): Promise<Result<void, IpcError>> => {
      const r = await deps.client.deleteProvider({ id })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    setSecret: async (input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.setProviderSecret(input)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
  }))
