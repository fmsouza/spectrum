import type { RunnerInbound, RunnerOutbound } from "@spectrum/agent-driver"
import { type IpcClient, createIpcClient } from "@spectrum/ipc"
import { Electroview, type RPCSchema } from "electrobun/view"
import { type ElectrobunRpc, createElectrobunTransport } from "./ipc-client"
import { type RunnerClient, createRunnerClient } from "./runner/runnerClient"

/** The Electroview only carries the IPC requests channel now (run events run over a WebSocket). */
type EmptySchema = {
  readonly bun: RPCSchema
  readonly webview: RPCSchema
}

/**
 * Build a `RunnerClient` over a dedicated loopback WebSocket (served by the bun
 * side — see apps/desktop/src/gui/runner-socket.ts): inbound `RunnerOutbound`
 * frames are dispatched; outbound `RunnerInbound` frames are JSON-sent (buffered
 * until open). Plain JSON — no base64.
 */
const createWsRunnerClient = (url: string): RunnerClient => {
  const ws = new WebSocket(url)
  const outbox: RunnerInbound[] = []
  const send = (message: RunnerInbound): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
    else outbox.push(message)
  }
  const client = createRunnerClient(send)
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
    client.dispatch(parsed as RunnerOutbound)
  })
  return client
}

/**
 * Construct the single Electroview (IPC requests only) and return all clients: the typed `IpcClient`
 * over Electrobun, and a `RunnerClient` over the dedicated runner WebSocket — its URL fetched from
 * the bun side via IPC. Called once by `app.tsx`.
 */
export const createRealClients = async (): Promise<{
  ipcClient: IpcClient
  runnerClient: RunnerClient
}> => {
  const rpc = Electroview.defineRPC<EmptySchema>({
    maxRequestTime: Number.POSITIVE_INFINITY, // transport owns per-method timeouts
    handlers: { requests: {}, messages: {} },
  })
  const view = new Electroview({ rpc })
  const ipcClient = createIpcClient(
    createElectrobunTransport(view.rpc as unknown as ElectrobunRpc),
  )
  const runnerRes = await ipcClient.getRunnerSocketUrl(undefined)
  const runnerClient = runnerRes.ok
    ? createWsRunnerClient(runnerRes.value.url)
    : createRunnerClient(() => {})
  return { ipcClient, runnerClient }
}
