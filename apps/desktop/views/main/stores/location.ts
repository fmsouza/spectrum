/** Read/write the URL hash. Injected so the app's hash sync is testable. */
export type LocationAdapter = {
  readonly readHash: () => string
  readonly writeHash: (hash: string) => void
}

/** Production adapter over the real `window.location.hash`. */
export const windowLocationAdapter: LocationAdapter = {
  readHash: () => window.location.hash,
  writeHash: (hash) => {
    window.location.hash = hash
  },
}

/** In-memory adapter for tests; `current()` exposes the latest written value. */
export const createFakeLocationAdapter = (
  initial = "",
): LocationAdapter & { readonly current: () => string } => {
  let hash = initial
  return {
    readHash: () => hash,
    writeHash: (h) => {
      hash = h
    },
    current: () => hash,
  }
}
