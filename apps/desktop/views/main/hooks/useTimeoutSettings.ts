import { useCallback, useEffect, useState } from "react"
import { useIpcClient } from "../IpcClientContext"
import { useNotifications } from "./useNotifications"

export type TimeoutSettings = {
  readonly firstTokenTimeoutMs: number
  readonly interTokenTimeoutMs: number
}

export type UseTimeoutSettings = {
  /** `undefined` while the initial load is in flight. */
  readonly settings: TimeoutSettings | undefined
  readonly save: (next: TimeoutSettings) => Promise<void>
}

/**
 * Loads both LLM timeout values on mount and exposes a `save` function that
 * persists them via IPC. Error toasts surface on save failure; load errors are
 * silent (the fields will simply stay empty until a refetch succeeds).
 *
 * A full Zustand store is intentionally avoided here: this hook has a single
 * consumer (GeneralPage), no cross-page state sharing, and no background
 * polling. The simpler hook pattern keeps the footprint minimal.
 */
export const useTimeoutSettings = (): UseTimeoutSettings => {
  const client = useIpcClient()
  const { notify } = useNotifications()

  const [settings, setSettings] = useState<TimeoutSettings | undefined>(
    undefined,
  )

  const load = useCallback(async (): Promise<void> => {
    const r = await client.getTimeoutSettings(undefined)
    if (r.ok) setSettings(r.value)
    // Load errors are not toasted — the user did nothing wrong; fields stay
    // unpopulated. A retry happens on the next mount.
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (next: TimeoutSettings): Promise<void> => {
      const r = await client.updateTimeoutSettings(next)
      if (r.ok) {
        setSettings(next)
      } else {
        notify({
          tone: "error",
          message: "Couldn't save the timeout settings.",
        })
      }
    },
    [client, notify],
  )

  return { settings, save }
}
