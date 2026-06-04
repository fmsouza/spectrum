import type { SessionId } from "@launchkit/types"
import { useCallback, useState } from "react"
import type { TerminalClient } from "./terminalClient"

/** Manages the set of open terminal tab ids and the lifecycle of their PTYs. */
export interface UseTerminals {
  readonly tabs: readonly SessionId[]
  readonly openTab: (id: SessionId) => void
  readonly closeTab: (id: SessionId) => void
}

/**
 * React state for the open terminal tabs. `openTab` adds a session id (no-op if
 * already open); `closeTab` kills the PTY via the client and drops the tab. The
 * `client` is injected so this hook stays testable without an Electroview (the
 * real one comes from `createRealClients` in `clients.ts`).
 */
export const useTerminals = (client: TerminalClient): UseTerminals => {
  const [tabs, setTabs] = useState<readonly SessionId[]>([])

  const openTab = useCallback((id: SessionId): void => {
    setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const closeTab = useCallback(
    (id: SessionId): void => {
      client.kill(id)
      setTabs((prev) => prev.filter((tab) => tab !== id))
    },
    [client],
  )

  return { tabs, openTab, closeTab }
}
