import {
  type RunManager,
  type RunnerOutbound,
  decodeRunnerInbound,
} from "@launchkit/agent-driver"
import { isOk } from "@launchkit/utils"

export interface RunnerSocket {
  /** `ws://localhost:<port>/` — handed to the webview via the `getRunnerSocketUrl` IPC method. */
  readonly url: string
  stop(): void
}

/** Minimal seam matching Bun's websocket `send`, so the handlers are unit-testable without a server. */
interface SocketLike {
  send(data: string): void
}

/**
 * The pure message-handling core of the runner socket, extracted so it is unit-tested without a live
 * `Bun.serve`. `open` binds the manager's send sink to the socket; `message` zod-decodes inbound JSON
 * (`RunnerInbound`) and forwards it to `manager.handleInbound`. Mirrors terminal-socket.ts.
 */
export const makeRunnerSocketHandlers = (
  manager: RunManager,
): {
  open(ws: SocketLike): void
  message(raw: string | ArrayBufferView | ArrayBuffer): void
} => ({
  open(ws) {
    manager.bindSend((message: RunnerOutbound) => {
      try {
        ws.send(JSON.stringify(message))
      } catch {
        /* socket closing — drop */
      }
    })
  },
  message(raw) {
    if (typeof raw !== "string") return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const decoded = decodeRunnerInbound(parsed)
    if (isOk(decoded)) manager.handleInbound(decoded.value)
  },
})

/**
 * A dedicated loopback WebSocket carrying the canonical run-event stream, separate from Electrobun's
 * RPC and from the terminal socket. One webview ⇒ one connection. `RunnerInbound` frames route to
 * `manager.handleInbound`; `manager.bindSend` is pointed at the live socket so `RunnerOutbound` is
 * pushed straight to the webview. Structurally identical to terminal-socket.ts.
 */
export const startRunnerSocket = (manager: RunManager): RunnerSocket => {
  const handlers = makeRunnerSocketHandlers(manager)
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response("launchkit runner socket", { status: 426 })
    },
    websocket: {
      open(ws) {
        handlers.open(ws)
      },
      message(_ws, raw) {
        handlers.message(raw)
      },
    },
  })
  // Connect via `localhost` (not 127.0.0.1) so the webview CSP `connect-src ws://localhost:*` allows it.
  return {
    url: `ws://localhost:${server.port}/`,
    stop: () => server.stop(true),
  }
}
