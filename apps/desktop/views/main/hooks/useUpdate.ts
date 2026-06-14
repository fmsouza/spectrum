import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type { Channel, UpdateState } from "../stores/updateStore"

/** Poll interval (ms) while a download is in flight. */
const DOWNLOAD_POLL_MS = 800

export interface UseUpdate {
  readonly state: UpdateState | undefined
  readonly download: () => void
  readonly apply: () => void
  readonly dismiss: () => void
  readonly check: () => void
  readonly setChannel: (channel: Channel) => void
}

/**
 * Drives the update lifecycle for the view. Runs a single check on mount ("notify
 * on open"), and while the phase is "downloading" polls `getUpdateState` so the
 * banner reflects live progress without a server push (the IPC contract is
 * request/response; a download exceeds the 5s RPC budget, so it is fire-and-forget
 * on the Bun side).
 */
export const useUpdate = (): UseUpdate => {
  const store = useStores().update
  const state = useStore(store, (s) => s.state)
  const check = useStore(store, (s) => s.check)
  const refresh = useStore(store, (s) => s.refresh)
  const download = useStore(store, (s) => s.download)
  const apply = useStore(store, (s) => s.apply)
  const dismiss = useStore(store, (s) => s.dismiss)
  const setChannel = useStore(store, (s) => s.setChannel)

  // On open: one check.
  useEffect(() => {
    void check()
  }, [check])

  // While downloading: poll for progress/completion.
  const phase = state?.phase
  useEffect(() => {
    if (phase !== "downloading") return
    const id = setInterval(() => {
      void refresh()
    }, DOWNLOAD_POLL_MS)
    return () => clearInterval(id)
  }, [phase, refresh])

  return {
    state,
    download: () => void download(),
    apply: () => void apply(),
    dismiss: () => void dismiss(),
    check: () => void check(),
    setChannel: (channel) => void setChannel(channel),
  }
}
