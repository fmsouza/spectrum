import type { HarnessView } from "@spectrum/ipc"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { AsyncResource } from "./useAsyncResource"

export type UseHarnesses = AsyncResource<readonly HarnessView[]>

export const useHarnesses = (): UseHarnesses => {
  const store = useStores().harnesses
  const data = useStore(store, (s) => s.data)
  const loading = useStore(store, (s) => s.loading)
  const error = useStore(store, (s) => s.error)
  const fetch = useStore(store, (s) => s.fetch)
  const invalidate = useStore(store, (s) => s.invalidate)
  useEffect(() => {
    void fetch()
  }, [fetch])
  return {
    data,
    loading,
    error,
    refetch: () => void invalidate(),
  }
}
