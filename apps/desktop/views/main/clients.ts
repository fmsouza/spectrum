import { type IpcClient, createIpcClient } from "@launchkit/ipc"
import type { PtyInbound, PtyOutbound } from "@launchkit/pty/protocol"
import { Electroview, type RPCSchema } from "electrobun/view"
import { type ElectrobunRpc, createElectrobunTransport } from "./ipc-client"
import {
  type TerminalClient,
  createTerminalClient,
} from "./terminal/terminalClient"

/**
 * Combined RPC schema carried by the ONE shared Electroview: the IPC requests
 * channel (the webview only *initiates* requests, so its own `requests` handler
 * set is empty) PLUS the terminal `messages.pty` channel. The webview *receives*
 * `PtyOutbound` (`webview.messages.pty`) and *sends* `PtyInbound`
 * (`bun.messages.pty`).
 *
 * `Electroview` is a singleton per webview — it owns
 * `window.__electrobun.receiveMessageFromBun` and the RPC socket — so building
 * two of them (one for IPC, one for the terminal) makes the second clobber the
 * first's receive handler, breaking IPC (empty harness list) and terminal
 * messaging. This file is the single place `new Electroview` is constructed.
 */
type CombinedSchema = {
  readonly bun: RPCSchema<{ readonly messages: { readonly pty: PtyInbound } }>
  readonly webview: RPCSchema<{
    readonly messages: { readonly pty: PtyOutbound }
  }>
}

/** The fire-and-forget surface used to push `PtyInbound` over the shared view. */
type PtyRpc = {
  readonly send: (name: string, payload: PtyInbound) => void
}

/**
 * Construct the ONE shared Electroview and return both clients built over it:
 * the typed `IpcClient` (over `view.rpc.request`) and the `TerminalClient` (over
 * `view.rpc.send("pty", ...)`), with inbound `messages.pty` routed into the
 * terminal client's `dispatch`. Called once by `app.tsx` for the real app.
 */
export const createRealClients = (): {
  ipcClient: IpcClient
  terminalClient: TerminalClient
} => {
  // Late-bound: the terminal client is built after the Electroview RPC exists,
  // so the inbound handler closes over it.
  let terminalClient: TerminalClient | null = null
  const rpc = Electroview.defineRPC<CombinedSchema>({
    maxRequestTime: 5000,
    handlers: {
      requests: {},
      messages: {
        pty: (payload: PtyOutbound): void => {
          terminalClient?.dispatch(payload)
        },
      },
    },
  })
  const view = new Electroview({ rpc })
  const ipcClient = createIpcClient(
    createElectrobunTransport(view.rpc as unknown as ElectrobunRpc),
  )
  const send = (message: PtyInbound): void => {
    ;(view.rpc as unknown as PtyRpc).send("pty", message)
  }
  terminalClient = createTerminalClient(send)
  return { ipcClient, terminalClient }
}
