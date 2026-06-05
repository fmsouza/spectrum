import type { Profile } from "@launchkit/types"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { ProfilesStore } from "../stores/profilesStore"
import type { AsyncResource } from "./useAsyncResource"

export type UseProfiles = AsyncResource<readonly Profile[]> & {
  readonly add: ProfilesStore["add"]
  readonly update: ProfilesStore["update"]
  readonly remove: ProfilesStore["remove"]
}

/** Loads profiles and exposes CRUD that calls the client then refetches. */
export const useProfiles = (): UseProfiles => {
  const store = useStores().profiles
  const data = useStore(store, (s) => s.data)
  const loading = useStore(store, (s) => s.loading)
  const error = useStore(store, (s) => s.error)
  const fetch = useStore(store, (s) => s.fetch)
  const invalidate = useStore(store, (s) => s.invalidate)
  const add = useStore(store, (s) => s.add)
  const update = useStore(store, (s) => s.update)
  const remove = useStore(store, (s) => s.remove)
  useEffect(() => {
    void fetch()
  }, [fetch])
  return {
    data,
    loading,
    error,
    refetch: () => void invalidate(),
    add,
    update,
    remove,
  }
}
