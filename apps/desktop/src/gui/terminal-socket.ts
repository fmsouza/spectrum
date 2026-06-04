import {
  type PtyOutbound,
  type TerminalManager,
  decodeInbound,
} from "@launchkit/pty"
import { isOk } from "@launchkit/utils"

export interface TerminalSocket {
  /** `ws://localhost:<port>/` — handed to the webview via the `getTerminalSocketUrl` IPC method. */
  readonly url: string
  stop(): void
}

/**
 * A dedicated loopback WebSocket carrying the PTY byte stream, separate from Electrobun's RPC.
 *
 * The harness TUI (e.g. Claude Code's Ink renderer) probes the terminal at startup with capability
 * queries (DA1 `ESC[c`, cursor-position reports, …) and redraws thousands of times via cursor-up +
 * erase. Routing that high-frequency, latency-sensitive byte stream + the query/response round trip
 * over Electrobun's message channel (per-message JSON + encryption + executeJavaScript) was too slow
 * and lossy, so the harness degraded into a scroll-and-redraw mode that piled up garbled frames. A
 * direct WebSocket on loopback is ordered, lossless, and ~1ms — matching how a real terminal behaves.
 *
 * One webview ⇒ one connection. Inbound frames (`PtyInbound`) route to `manager.handleInbound`;
 * `manager.bindSend` is pointed at the live socket so `PtyOutbound` is pushed straight to the webview.
 */
export const startTerminalSocket = (
  manager: TerminalManager,
): TerminalSocket => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response("launchkit terminal socket", { status: 426 })
    },
    websocket: {
      open(ws) {
        manager.bindSend((message: PtyOutbound) => {
          try {
            ws.send(JSON.stringify(message))
          } catch {
            /* socket closing — drop */
          }
        })
      },
      message(_ws, raw) {
        if (typeof raw !== "string") return
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        const decoded = decodeInbound(parsed)
        if (isOk(decoded)) manager.handleInbound(decoded.value)
      },
    },
  })
  // Connect via `localhost` (not 127.0.0.1) so the webview CSP `connect-src ws://localhost:*` allows it.
  return {
    url: `ws://localhost:${server.port}/`,
    stop: () => server.stop(true),
  }
}
