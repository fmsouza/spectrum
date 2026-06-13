import type { ProviderView } from "@spectrum/ipc"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { ProvidersStore } from "../stores/providersStore"
import type { AsyncResource } from "./useAsyncResource"

export type UseProviders = AsyncResource<readonly ProviderView[]> & {
  readonly add: ProvidersStore["add"]
  readonly update: ProvidersStore["update"]
  readonly remove: ProvidersStore["remove"]
  readonly setSecret: ProvidersStore["setSecret"]
}

/** Loads the secret-free provider views and exposes provider mutations. */
export const useProviders = (): UseProviders => {
  const store = useStores().providers
  const data = useStore(store, (s) => s.data)
  const loading = useStore(store, (s) => s.loading)
  const error = useStore(store, (s) => s.error)
  const fetch = useStore(store, (s) => s.fetch)
  const invalidate = useStore(store, (s) => s.invalidate)
  const add = useStore(store, (s) => s.add)
  const update = useStore(store, (s) => s.update)
  const remove = useStore(store, (s) => s.remove)
  const setSecret = useStore(store, (s) => s.setSecret)
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
    setSecret,
  }
}
