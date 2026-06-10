import type { HarnessView, IpcError, IpcMethods } from "@launchkit/ipc"
import type { HarnessId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addHarness"]["params"]
type UpdateInput = IpcMethods["updateHarness"]["params"]["input"]

export type HarnessesStore = ResourceState<readonly HarnessView[]> & {
  readonly add: (input: AddInput) => Promise<Result<void, IpcError>>
  readonly update: (
    id: HarnessId,
    input: UpdateInput,
  ) => Promise<Result<void, IpcError>>
  readonly remove: (id: HarnessId) => Promise<Result<void, IpcError>>
}

export const createHarnessesStore = (
  deps: StoreDeps,
): StoreApi<HarnessesStore> =>
  createStore<HarnessesStore>()((set, get) => ({
    ...createResource<readonly HarnessView[]>(
      () => deps.client.getHarnesses(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.addHarness(input)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    update: async (id, input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.updateHarness({ id, input })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    remove: async (id): Promise<Result<void, IpcError>> => {
      const r = await deps.client.deleteHarness({ id })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
  }))
