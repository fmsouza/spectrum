import { type IpcClient, createIpcClient } from "@launchkit/ipc"
import type { PtyInbound, PtyOutbound } from "@launchkit/pty/protocol"
import { Electroview, type RPCSchema } from "electrobun/view"
import { type ElectrobunRpc, createElectrobunTransport } from "./ipc-client"
import {
  type TerminalClient,
  createTerminalClient,
} from "./terminal/terminalClient"

/** The Electroview only carries the IPC requests channel now (terminal runs over a WebSocket). */
type EmptySchema = {
  readonly bun: RPCSchema
  readonly webview: RPCSchema
}

/**
 * Build a `TerminalClient` over a dedicated loopback WebSocket (`ws://localhost:<port>/`, served by
 * the bun side — see apps/desktop/src/gui/terminal-socket.ts). The PTY byte stream needs the low
 * latency + lossless ordering of a direct socket (the harness TUI's startup capability queries and
 * thousands of cursor-up/erase redraws degraded over Electrobun's message channel). Inbound
 * `PtyOutbound` frames are dispatched to the client; outbound `PtyInbound` frames are JSON-sent
 * (buffered until the socket opens). IPC requests stay on Electrobun.
 */
const createWsTerminalClient = (url: string): TerminalClient => {
  const ws = new WebSocket(url)
  const outbox: PtyInbound[] = []
  const send = (message: PtyInbound): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
    else outbox.push(message)
  }
  const client = createTerminalClient(send)
  ws.addEventListener("open", () => {
    while (outbox.length > 0) {
      const next = outbox.shift()
      if (next !== undefined) ws.send(JSON.stringify(next))
    }
  })
  ws.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data !== "string") return
    let parsed: unknown
    try {
      parsed = JSON.parse(event.data)
    } catch {
      return
    }
    client.dispatch(parsed as PtyOutbound)
  })
  return client
}

/**
 * Construct the single Electroview (IPC requests only) and return both clients: the typed `IpcClient`
 * over Electrobun, and a `TerminalClient` over the dedicated terminal WebSocket whose URL is fetched
 * from the bun side via the `getTerminalSocketUrl` IPC method. Called once by `app.tsx`.
 */
export const createRealClients = async (): Promise<{
  ipcClient: IpcClient
  terminalClient: TerminalClient
}> => {
  const rpc = Electroview.defineRPC<EmptySchema>({
    maxRequestTime: Number.POSITIVE_INFINITY, // transport owns per-method timeouts
    handlers: { requests: {}, messages: {} },
  })
  const view = new Electroview({ rpc })
  const ipcClient = createIpcClient(
    createElectrobunTransport(view.rpc as unknown as ElectrobunRpc),
  )
  const res = await ipcClient.getTerminalSocketUrl(undefined)
  const terminalClient = res.ok
    ? createWsTerminalClient(res.value.url)
    : // If the URL lookup fails the app still renders; the terminal just can't stream.
      createTerminalClient(() => {})
  return { ipcClient, terminalClient }
}
