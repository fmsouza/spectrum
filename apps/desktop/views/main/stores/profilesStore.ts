import type { IpcMethods } from "@launchkit/ipc"
import type { Profile, ProfileId } from "@launchkit/types"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addProfile"]["params"]

export type ProfilesStore = ResourceState<readonly Profile[]> & {
  readonly add: (input: AddInput) => Promise<void>
  readonly update: (profile: Profile) => Promise<void>
  readonly remove: (id: ProfileId) => Promise<void>
}

export const createProfilesStore = (deps: StoreDeps): StoreApi<ProfilesStore> =>
  createStore<ProfilesStore>()((set, get) => ({
    ...createResource<readonly Profile[]>(
      () => deps.client.getProfiles(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input) => {
      const r = await deps.client.addProfile(input)
      if (r.ok) await get().invalidate()
    },
    update: async (profile) => {
      const r = await deps.client.updateProfile(profile)
      if (r.ok) await get().invalidate()
    },
    remove: async (id) => {
      const r = await deps.client.deleteProfile({ id })
      if (r.ok) await get().invalidate()
    },
  }))
