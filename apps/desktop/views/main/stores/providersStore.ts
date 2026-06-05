import type { IpcMethods, ProviderView } from "@launchkit/ipc"
import type { ProviderId } from "@launchkit/types"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addProvider"]["params"]
type UpdateInput = IpcMethods["updateProvider"]["params"]["input"]
type SetSecretInput = IpcMethods["setProviderSecret"]["params"]

export type ProvidersStore = ResourceState<readonly ProviderView[]> & {
  readonly add: (input: AddInput) => Promise<void>
  readonly update: (id: ProviderId, input: UpdateInput) => Promise<void>
  readonly remove: (id: ProviderId) => Promise<void>
  readonly setSecret: (input: SetSecretInput) => Promise<void>
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
    add: async (input) => {
      const r = await deps.client.addProvider(input)
      if (r.ok) await get().invalidate()
    },
    update: async (id, input) => {
      const r = await deps.client.updateProvider({ id, input })
      if (r.ok) await get().invalidate()
    },
    remove: async (id) => {
      const r = await deps.client.deleteProvider({ id })
      if (r.ok) await get().invalidate()
    },
    setSecret: async (input) => {
      const r = await deps.client.setProviderSecret(input)
      if (r.ok) await get().invalidate()
    },
  }))
