import {
  type RunManager,
  type RunnerOutbound,
  decodeRunnerInbound,
} from "@spectrum/agent-driver"
import { isOk } from "@spectrum/utils"

export interface RunnerSocket {
  /** `ws://localhost:<port>/` — handed to the webview via the `getRunnerSocketUrl` IPC method. */
  readonly url: string
  stop(): void
}

/** Minimal seam matching Bun's websocket `send`, so the handlers are unit-testable without a server. */
interface SocketLike {
  send(data: string): void
}

/** Renderer-liveness callbacks: fired on webview connect (open) and disconnect (close). */
export interface RunnerSocketHooks {
  readonly onConnect?: () => void
  readonly onDisconnect?: () => void
}

/**
 * The pure message-handling core of the runner socket, extracted so it is unit-tested without a live
 * `Bun.serve`. `open` binds the manager's send sink to the socket; `message` zod-decodes inbound JSON
 * (`RunnerInbound`) and forwards it to `manager.handleInbound`.
 */
export const makeRunnerSocketHandlers = (
  manager: RunManager,
  hooks: RunnerSocketHooks = {},
): {
  open(ws: SocketLike): void
  message(raw: string | ArrayBufferView | ArrayBuffer): void
  close(): void
} => ({
  open(ws) {
    manager.bindSend((message: RunnerOutbound) => {
      try {
        ws.send(JSON.stringify(message))
      } catch {
        /* socket closing — drop */
      }
    })
    hooks.onConnect?.()
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
  close() {
    hooks.onDisconnect?.()
  },
})

/**
 * A dedicated loopback WebSocket carrying the canonical run-event stream, separate from Electrobun's
 * RPC. One webview ⇒ one connection. `RunnerInbound` frames route to `manager.handleInbound`;
 * `manager.bindSend` is pointed at the live socket so `RunnerOutbound` is pushed straight to the
 * webview.
 */
export const startRunnerSocket = (
  manager: RunManager,
  hooks: RunnerSocketHooks = {},
): RunnerSocket => {
  const handlers = makeRunnerSocketHandlers(manager, hooks)
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response("spectrum runner socket", { status: 426 })
    },
    websocket: {
      open(ws) {
        handlers.open(ws)
      },
      message(_ws, raw) {
        handlers.message(raw)
      },
      close() {
        handlers.close()
      },
    },
  })
  // Connect via `localhost` (not 127.0.0.1) so the webview CSP `connect-src ws://localhost:*` allows it.
  return {
    url: `ws://localhost:${server.port}/`,
    stop: () => server.stop(true),
  }
}
