import type { HarnessDefinition } from "@launchkit/types"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { HarnessesStore } from "../stores/harnessesStore"
import type { AsyncResource } from "./useAsyncResource"

export type UseHarnesses = AsyncResource<readonly HarnessDefinition[]> & {
  readonly add: HarnessesStore["add"]
  readonly update: HarnessesStore["update"]
  readonly remove: HarnessesStore["remove"]
}

export const useHarnesses = (): UseHarnesses => {
  const store = useStores().harnesses
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
