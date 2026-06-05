import type { IpcError, IpcMethods } from "@launchkit/ipc"
import type { Profile, ProfileId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

type AddInput = IpcMethods["addProfile"]["params"]

export type ProfilesStore = ResourceState<readonly Profile[]> & {
  readonly add: (input: AddInput) => Promise<Result<void, IpcError>>
  readonly update: (profile: Profile) => Promise<Result<void, IpcError>>
  readonly remove: (id: ProfileId) => Promise<Result<void, IpcError>>
}

export const createProfilesStore = (deps: StoreDeps): StoreApi<ProfilesStore> =>
  createStore<ProfilesStore>()((set, get) => ({
    ...createResource<readonly Profile[]>(
      () => deps.client.getProfiles(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
    add: async (input): Promise<Result<void, IpcError>> => {
      const r = await deps.client.addProfile(input)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    update: async (profile): Promise<Result<void, IpcError>> => {
      const r = await deps.client.updateProfile(profile)
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
    remove: async (id): Promise<Result<void, IpcError>> => {
      const r = await deps.client.deleteProfile({ id })
      if (!r.ok) return r
      await get().invalidate()
      return { ok: true, value: undefined }
    },
  }))
