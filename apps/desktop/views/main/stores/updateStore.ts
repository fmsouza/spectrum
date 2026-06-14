import type { IpcMethods } from "@spectrum/ipc"
import { type StoreApi, createStore } from "zustand/vanilla"
import type { StoreDeps } from "./types"

export type UpdateState = IpcMethods["getUpdateState"]["result"]
export type Channel = UpdateState["channel"]

export interface UpdateStore {
  readonly state: UpdateState | undefined
  /** Network check (called on app open). */
  readonly check: () => Promise<void>
  /** Re-read the current state without a network check (used while polling). */
  readonly refresh: () => Promise<void>
  /** Begin the background download, then refresh once. */
  readonly download: () => Promise<void>
  /** Apply the staged update + relaunch. */
  readonly apply: () => Promise<void>
  /** Dismiss the banner for the current latest version. */
  readonly dismiss: () => Promise<void>
  /** Switch channel and adopt the returned state. */
  readonly setChannel: (channel: Channel) => Promise<void>
}

export const createUpdateStore = (deps: StoreDeps): StoreApi<UpdateStore> =>
  createStore<UpdateStore>()((set, get) => ({
    state: undefined,
    check: async () => {
      const r = await deps.client.checkForUpdate(undefined)
      if (r.ok) set({ state: r.value })
    },
    refresh: async () => {
      const r = await deps.client.getUpdateState(undefined)
      if (r.ok) set({ state: r.value })
    },
    download: async () => {
      await deps.client.startUpdateDownload(undefined)
      await get().refresh()
    },
    apply: async () => {
      await deps.client.applyUpdate(undefined)
    },
    dismiss: async () => {
      const version = get().state?.latestVersion
      if (version === undefined || version === null) return
      await deps.client.dismissUpdate({ version })
      await get().refresh()
    },
    setChannel: async (channel) => {
      const r = await deps.client.setUpdateChannel({ channel })
      if (r.ok) set({ state: r.value })
    },
  }))
