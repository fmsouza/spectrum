import type { IpcMethods } from "@launchkit/ipc"
import type { Profile, ProfileId } from "@launchkit/types"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/** addProfile params = ProfileSchema WITHOUT id (the handler mints it). */
type AddInput = IpcMethods["addProfile"]["params"]

export type UseProfiles = AsyncResource<readonly Profile[]> & {
  readonly add: (input: AddInput) => Promise<void>
  readonly update: (profile: Profile) => Promise<void>
  readonly remove: (id: ProfileId) => Promise<void>
}

/** Loads profiles and exposes CRUD that calls the client then refetches. */
export const useProfiles = (): UseProfiles => {
  const client = useIpcClient()
  const call = useCallback(() => client.getProfiles(undefined), [client])
  const resource = useAsyncResource(call)
  const { refetch } = resource

  const add = useCallback(
    async (input: AddInput): Promise<void> => {
      const r = await client.addProfile(input)
      if (r.ok) refetch()
    },
    [client, refetch],
  )
  const update = useCallback(
    async (profile: Profile): Promise<void> => {
      const r = await client.updateProfile(profile)
      if (r.ok) refetch()
    },
    [client, refetch],
  )
  const remove = useCallback(
    async (id: ProfileId): Promise<void> => {
      const r = await client.deleteProfile({ id })
      if (r.ok) refetch()
    },
    [client, refetch],
  )
  return { ...resource, add, update, remove }
}
