import type { HarnessView } from "@launchkit/ipc"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

/** Read-only list of the builtin harnesses (custom user harnesses are no longer supported). */
export type HarnessesStore = ResourceState<readonly HarnessView[]>

export const createHarnessesStore = (
  deps: StoreDeps,
): StoreApi<HarnessesStore> =>
  createStore<HarnessesStore>()((set, get) => ({
    ...createResource<readonly HarnessView[]>(
      () => deps.client.getHarnesses(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
  }))
