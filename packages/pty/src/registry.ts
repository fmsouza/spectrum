import type { SessionId } from "@launchkit/types"
import type { PtyHandle } from "./pty"
import { type Scrollback, createScrollback } from "./scrollback"

export interface TerminalState {
  readonly pty: PtyHandle
  readonly scrollback: Scrollback
  status: "running" | "exited"
  exitCode: number | null
}

export interface TerminalRegistry {
  add(id: SessionId, pty: PtyHandle): void
  get(id: SessionId): TerminalState | undefined
  appendData(id: SessionId, chunk: Uint8Array): void
  markExited(id: SessionId, code: number): void
  snapshot(id: SessionId): Uint8Array
  remove(id: SessionId): void
}

export const createTerminalRegistry = (capBytes: number): TerminalRegistry => {
  const map = new Map<SessionId, TerminalState>()
  return {
    add: (id, pty) => {
      map.set(id, {
        pty,
        scrollback: createScrollback(capBytes),
        status: "running",
        exitCode: null,
      })
    },
    get: (id) => map.get(id),
    appendData: (id, chunk) => map.get(id)?.scrollback.append(chunk),
    markExited: (id, code) => {
      const s = map.get(id)
      if (s) {
        s.status = "exited"
        s.exitCode = code
      }
    },
    snapshot: (id) => map.get(id)?.scrollback.snapshot() ?? new Uint8Array(0),
    remove: (id) => {
      map.delete(id)
    },
  }
}
