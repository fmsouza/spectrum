import type { PtyInbound, PtyOutbound } from "@launchkit/pty"
import type { SessionId } from "@launchkit/types"
import { Electroview, type RPCSchema } from "electrobun/view"
import { useCallback, useState } from "react"
import { type TerminalClient, createTerminalClient } from "./terminalClient"

/**
 * The Electrobun RPC surface the terminal seam uses: the single `send(name,
 * payload)` fire-and-forget channel. The bun side mirrors this — it registers
 * `messages: { pty }` and pushes `PtyOutbound` via `rpc.send("pty", msg)`
 * (`apps/desktop/src/gui/window.ts`). We only ever `send`; inbound messages
 * arrive via the `messages.pty` handler registered below.
 */
type PtyRpc = {
  readonly send: (name: string, payload: PtyInbound) => void
}

/**
 * RPC schema for the terminal `messages` channel. Both sides expose a single
 * `pty` message; the webview *receives* `PtyOutbound` (`webview.messages.pty`)
 * and *sends* `PtyInbound` (`bun.messages.pty`). Requests are unused here.
 */
type PtySchema = {
  readonly bun: RPCSchema<{ readonly messages: { readonly pty: PtyInbound } }>
  readonly webview: RPCSchema<{
    readonly messages: { readonly pty: PtyOutbound }
  }>
}

/**
 * The single Electrobun-coupled function for the terminal channel (mirrors
 * `createRealIpcClient`). Builds the pure `TerminalClient` over `view.rpc.send`
 * and registers the inbound `messages.pty` handler to route `PtyOutbound`
 * messages into `client.dispatch`. Called once by the TerminalPage (next task).
 */
export const createRealTerminalClient = (): TerminalClient => {
  // Late-bound: the client is built after the Electroview RPC exists, so the
  // inbound handler closes over it.
  let client: TerminalClient | null = null
  const rpc = Electroview.defineRPC<PtySchema>({
    maxRequestTime: 5000,
    handlers: {
      requests: {},
      messages: {
        pty: (payload: PtyOutbound): void => {
          client?.dispatch(payload)
        },
      },
    },
  })
  const view = new Electroview({ rpc })
  const send = (message: PtyInbound): void => {
    ;(view.rpc as unknown as PtyRpc).send("pty", message)
  }
  client = createTerminalClient(send)
  return client
}

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
 * real one comes from `createRealTerminalClient`).
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
