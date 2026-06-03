import {
  type PtyInbound,
  type PtyOutbound,
  base64ToBytes,
  bytesToBase64,
} from "@launchkit/pty"
import type { SessionId } from "@launchkit/types"

/**
 * Transport-agnostic terminal client. Encodes outbound terminal actions to
 * `PtyInbound` messages (handed to the injected `send`) and routes inbound
 * `PtyOutbound` messages to per-session listeners. The Electrobun coupling is
 * supplied entirely by the `send` function and by whoever calls `dispatch`, so
 * this module is pure and testable with a fake `send` (mirrors `ipc-client.ts`).
 */
export interface TerminalClient {
  attach(id: SessionId): void
  sendInput(id: SessionId, bytes: Uint8Array): void
  sendResize(id: SessionId, cols: number, rows: number): void
  kill(id: SessionId): void
  /** route an inbound PtyOutbound message to the registered per-session listeners */
  dispatch(message: PtyOutbound): void
  onData(id: SessionId, cb: (bytes: Uint8Array) => void): void
  onExit(id: SessionId, cb: (code: number) => void): void
}

export const createTerminalClient = (
  send: (message: PtyInbound) => void,
): TerminalClient => {
  // Single subscriber per session for each event kind is sufficient: one xterm
  // pane owns one session.
  const dataListeners = new Map<SessionId, (bytes: Uint8Array) => void>()
  const exitListeners = new Map<SessionId, (code: number) => void>()

  return {
    attach: (id) => {
      send({ type: "pty-attach", id })
    },
    sendInput: (id, bytes) => {
      send({ type: "pty-input", id, data: bytesToBase64(bytes) })
    },
    sendResize: (id, cols, rows) => {
      send({ type: "pty-resize", id, cols, rows })
    },
    kill: (id) => {
      send({ type: "pty-kill", id })
    },
    dispatch: (message) => {
      switch (message.type) {
        case "pty-data": {
          dataListeners.get(message.id)?.(base64ToBytes(message.data))
          return
        }
        case "pty-exit": {
          exitListeners.get(message.id)?.(message.code)
          return
        }
        default: {
          // Exhaustiveness guard: `message` is `never` here.
          const _exhaustive: never = message
          return _exhaustive
        }
      }
    },
    onData: (id, cb) => {
      dataListeners.set(id, cb)
    },
    onExit: (id, cb) => {
      exitListeners.set(id, cb)
    },
  }
}
