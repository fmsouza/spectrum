import type { IpcError, IpcMethods } from "@launchkit/ipc"
import type { Session } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"

type LaunchInput = IpcMethods["launchHarness"]["params"]
type LaunchResult = IpcMethods["launchHarness"]["result"]

/** The grouped sessions view: running + a paginated recent page, plus actions. */
export type UseSessions = {
  readonly running: readonly Session[]
  readonly recent: readonly Session[]
  readonly hasMore: boolean
  readonly loading: boolean
  readonly error: IpcError | undefined
  readonly loadMore: () => void
  readonly refetch: () => void
  readonly launch: (
    input: LaunchInput,
  ) => Promise<Result<LaunchResult, IpcError>>
}

export const useSessions = (): UseSessions => {
  const store = useStores().sessions
  const running = useStore(store, (s) => s.running)
  const recent = useStore(store, (s) => s.recent)
  const recentLimit = useStore(store, (s) => s.recentLimit)
  const loadingRunning = useStore(store, (s) => s.loadingRunning)
  const loadingRecent = useStore(store, (s) => s.loadingRecent)
  const errorRunning = useStore(store, (s) => s.errorRunning)
  const errorRecent = useStore(store, (s) => s.errorRecent)
  const fetchRunning = useStore(store, (s) => s.fetchRunning)
  const fetchRecent = useStore(store, (s) => s.fetchRecent)
  const setRecentLimit = useStore(store, (s) => s.setRecentLimit)
  const invalidate = useStore(store, (s) => s.invalidate)
  const launch = useStore(store, (s) => s.launch)

  useEffect(() => {
    void fetchRunning()
    void fetchRecent()
  }, [fetchRunning, fetchRecent])

  const runningList = running ?? []
  const recentList = recent ?? []
  return {
    running: runningList,
    recent: recentList,
    hasMore: recentList.length === recentLimit,
    loading: loadingRunning || loadingRecent,
    error: errorRunning ?? errorRecent,
    loadMore: () => setRecentLimit(recentLimit + 20),
    refetch: () => void invalidate(),
    launch,
  }
}
