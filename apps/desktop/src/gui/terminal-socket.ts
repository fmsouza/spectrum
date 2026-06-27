import {
  type TerminalManager,
  type TerminalOutbound,
  decodeTerminalInbound,
} from "@spectrum/pty"
import { isOk } from "@spectrum/utils"

export interface TerminalSocket {
  /** `ws://localhost:<port>/` — handed to the webview via the `getTerminalSocketUrl` IPC method. */
  readonly url: string
  stop(): void
}

/** Minimal seam matching Bun's websocket `send`, so the handlers are unit-testable without a server. */
interface SocketLike {
  send(data: string): void
}

export interface TerminalSocketHooks {
  readonly onConnect?: () => void
  readonly onDisconnect?: () => void
}

/**
 * The pure message-handling core of the terminal socket, extracted so it is unit-tested without a live
 * `Bun.serve`. `open` binds the manager's send sink to the socket; `message` zod-decodes inbound JSON
 * (`TerminalInbound`) and forwards it to `manager.handleInbound`.
 */
export const makeTerminalSocketHandlers = (
  manager: TerminalManager,
  hooks: TerminalSocketHooks = {},
): {
  open(ws: SocketLike): void
  message(raw: string | ArrayBufferView | ArrayBuffer): void
  close(): void
} => ({
  open(ws) {
    manager.bindSend((message: TerminalOutbound) => {
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
    const decoded = decodeTerminalInbound(parsed)
    if (isOk(decoded)) manager.handleInbound(decoded.value)
  },
  close() {
    hooks.onDisconnect?.()
  },
})

/**
 * A dedicated loopback WebSocket carrying the terminal byte stream, separate from Electrobun's RPC
 * and from the runner socket. One webview ⇒ one connection.
 */
export const startTerminalSocket = (
  manager: TerminalManager,
  hooks: TerminalSocketHooks = {},
): TerminalSocket => {
  const handlers = makeTerminalSocketHandlers(manager, hooks)
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response("spectrum terminal socket", { status: 426 })
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
  return {
    url: `ws://localhost:${server.port}/`,
    stop: () => server.stop(true),
  }
}
