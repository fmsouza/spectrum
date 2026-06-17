import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { ProxyStatus } from "../stores/proxyStore"
import type { AsyncResource } from "./useAsyncResource"

export type { ProxyStatus }

/** Default re-poll cadence (ms) for the proxy status dot. */
const DEFAULT_POLL_MS = 3_000

/**
 * The GUI proxy binds ASYNCHRONOUSLY at startup (config load → `Bun.serve`), so the
 * first status fetch can land before the loopback server is listening — showing a grey
 * dot that, with only a one-shot fetch, never recovers without an app restart. Re-poll
 * on an interval so the dot reflects the live proxy: grey until it binds, then green
 * (and back to grey if it ever stops). `pollMs` is injectable for fast tests.
 */
export const useProxyStatus = (
  pollMs: number = DEFAULT_POLL_MS,
): AsyncResource<ProxyStatus> => {
  const store = useStores().proxy
  const data = useStore(store, (s) => s.data)
  const loading = useStore(store, (s) => s.loading)
  const error = useStore(store, (s) => s.error)
  const fetch = useStore(store, (s) => s.fetch)
  const invalidate = useStore(store, (s) => s.invalidate)
  useEffect(() => {
    void fetch()
  }, [fetch])
  useEffect(() => {
    const id = setInterval(() => void invalidate(), pollMs)
    return () => clearInterval(id)
  }, [invalidate, pollMs])
  return { data, loading, error, refetch: () => void invalidate() }
}
