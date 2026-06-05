import type { IpcMethods } from "@launchkit/ipc"
import type { HarnessDefinition, HarnessId } from "@launchkit/types"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addHarness"]["params"]
type UpdateInput = IpcMethods["updateHarness"]["params"]["input"]

export type HarnessesStore = ResourceState<readonly HarnessDefinition[]> & {
  readonly add: (input: AddInput) => Promise<void>
  readonly update: (id: HarnessId, input: UpdateInput) => Promise<void>
  readonly remove: (id: HarnessId) => Promise<void>
}

export const createHarnessesStore = (
  deps: StoreDeps,
): StoreApi<HarnessesStore> =>
  createStore<HarnessesStore>()((set, get) => ({
    ...createResource<readonly HarnessDefinition[]>(
      () => deps.client.getHarnesses(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input) => {
      const r = await deps.client.addHarness(input)
      if (r.ok) await get().invalidate()
    },
    update: async (id, input) => {
      const r = await deps.client.updateHarness({ id, input })
      if (r.ok) await get().invalidate()
    },
    remove: async (id) => {
      const r = await deps.client.deleteHarness({ id })
      if (r.ok) await get().invalidate()
    },
  }))
