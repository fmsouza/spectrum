import type { IpcError } from "@spectrum/ipc"
import type { Result } from "@spectrum/utils"

/** The uniform server-cache slice every IPC-backed store exposes. */
export type ResourceState<T> = {
  readonly data: T | undefined
  readonly loading: boolean
  readonly error: IpcError | undefined
  /** Fetch only if not already loaded; concurrent calls share one request. */
  readonly fetch: () => Promise<void>
  /** Force a refetch (used after mutations); concurrent calls share one request. */
  readonly invalidate: () => Promise<void>
}

/** The subset of fields createResource writes back through the store's `set`. */
type ResourcePatch<T> = {
  readonly data?: T
  readonly loading?: boolean
  readonly error?: IpcError | undefined
}

/**
 * Build the {data, loading, error, fetch, invalidate} portion of a store. The
 * in-flight promise lives in this closure — the store initializer runs once per
 * store instance — so overlapping fetch/invalidate calls share a single IPC
 * request and one cached result. On error, existing `data` is left untouched
 * (matches the old useAsyncResource behaviour).
 */
export const createResource = <T>(
  call: () => Promise<Result<T, IpcError>>,
  set: (patch: ResourcePatch<T>) => void,
  getData: () => T | undefined,
): ResourceState<T> => {
  let inflight: Promise<void> | undefined
  // A generation counter lets a forced reload (invalidate) supersede an older
  // in-flight request: the stale promise's resolution is ignored so it can't
  // overwrite fresh data, and it won't clear the newer gate.
  let gen = 0
  const load = (): Promise<void> => {
    if (inflight !== undefined) return inflight
    const myGen = ++gen
    set({ loading: true })
    const p = call()
      .then((r) => {
        if (myGen !== gen) return
        if (r.ok) set({ data: r.value, error: undefined, loading: false })
        else set({ error: r.error, loading: false })
      })
      .finally(() => {
        if (myGen === gen) inflight = undefined
      })
    inflight = p
    return p
  }
  return {
    // Initial values only; live state is owned by the store atom via `set`.
    data: undefined,
    loading: false,
    error: undefined,
    fetch: () => (getData() !== undefined ? Promise.resolve() : load()),
    invalidate: () => {
      // Force a fresh load even if one is in flight: abandon the current gate so
      // load() starts a new request; the superseded one is ignored via `gen`.
      inflight = undefined
      return load()
    },
  }
}
