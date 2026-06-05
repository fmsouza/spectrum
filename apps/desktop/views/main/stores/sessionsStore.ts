import type { IpcError, IpcMethods } from "@launchkit/ipc"
import type { Session } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import type { StoreDeps } from "./types"

type LaunchInput = IpcMethods["launchHarness"]["params"]
type LaunchResult = IpcMethods["launchHarness"]["result"]

export type SessionsStore = {
  readonly running: readonly Session[] | undefined
  readonly recent: readonly Session[] | undefined
  readonly recentLimit: number
  readonly loadingRunning: boolean
  readonly loadingRecent: boolean
  readonly errorRunning: IpcError | undefined
  readonly errorRecent: IpcError | undefined
  readonly fetchRunning: () => Promise<void>
  readonly fetchRecent: () => Promise<void>
  readonly setRecentLimit: (n: number) => void
  readonly invalidate: () => Promise<void>
  readonly launch: (
    input: LaunchInput,
  ) => Promise<Result<LaunchResult, IpcError>>
}

export const createSessionsStore = (deps: StoreDeps): StoreApi<SessionsStore> =>
  createStore<SessionsStore>()((set, get) => {
    let runInflight: Promise<void> | undefined
    let recInflight: Promise<void> | undefined

    const loadRunning = (): Promise<void> => {
      if (runInflight !== undefined) return runInflight
      set({ loadingRunning: true })
      const p = deps.client
        .getSessions({ running: true })
        .then((r) => {
          if (r.ok)
            set({
              running: r.value,
              errorRunning: undefined,
              loadingRunning: false,
            })
          else set({ errorRunning: r.error, loadingRunning: false })
        })
        .finally(() => {
          runInflight = undefined
        })
      runInflight = p
      return p
    }

    const loadRecent = (): Promise<void> => {
      if (recInflight !== undefined) return recInflight
      set({ loadingRecent: true })
      const limit = get().recentLimit
      const p = deps.client
        .getSessions({ running: false, limit })
        .then((r) => {
          if (r.ok)
            set({
              recent: r.value,
              errorRecent: undefined,
              loadingRecent: false,
            })
          else set({ errorRecent: r.error, loadingRecent: false })
        })
        .finally(() => {
          recInflight = undefined
        })
      recInflight = p
      return p
    }

    return {
      running: undefined,
      recent: undefined,
      recentLimit: 20,
      loadingRunning: false,
      loadingRecent: false,
      errorRunning: undefined,
      errorRecent: undefined,
      fetchRunning: () =>
        get().running !== undefined ? Promise.resolve() : loadRunning(),
      fetchRecent: () =>
        get().recent !== undefined ? Promise.resolve() : loadRecent(),
      setRecentLimit: (n) => {
        // Drop the cached page so loadRecent re-queries with the new limit.
        set({ recentLimit: n, recent: undefined })
        void loadRecent()
      },
      invalidate: async () => {
        // Force both: clear caches, then load.
        set({ running: undefined, recent: undefined })
        await Promise.all([loadRunning(), loadRecent()])
      },
      launch: async (input) => {
        const r = await deps.client.launchHarness(input)
        if (r.ok) await get().invalidate()
        return r
      },
    }
  })
