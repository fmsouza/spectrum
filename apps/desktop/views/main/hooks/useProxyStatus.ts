import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { ProxyStatus } from "../stores/proxyStore"
import type { AsyncResource } from "./useAsyncResource"

export type { ProxyStatus }

export const useProxyStatus = (): AsyncResource<ProxyStatus> => {
  const store = useStores().proxy
  const data = useStore(store, (s) => s.data)
  const loading = useStore(store, (s) => s.loading)
  const error = useStore(store, (s) => s.error)
  const fetch = useStore(store, (s) => s.fetch)
  const invalidate = useStore(store, (s) => s.invalidate)
  useEffect(() => {
    void fetch()
  }, [fetch])
  return { data, loading, error, refetch: () => void invalidate() }
}
