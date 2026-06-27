import type { TerminalInbound, TerminalOutbound } from "@spectrum/pty"
import { isTerminalOutbound } from "@spectrum/pty"
import type { SessionId } from "@spectrum/types"

export interface TerminalClient {
  open(input: {
    sessionId: SessionId
    tabId: string
    cwd: string
    cols: number
    rows: number
    env?: Record<string, string>
  }): void
  attach(input: { sessionId: SessionId; tabId: string }): void
  input(input: { sessionId: SessionId; tabId: string; data: string }): void
  resize(input: {
    sessionId: SessionId
    tabId: string
    cols: number
    rows: number
  }): void
  close(input: { sessionId: SessionId; tabId: string }): void
  dispatch(message: TerminalOutbound): void
  onOutput(
    sessionId: SessionId,
    tabId: string,
    cb: (data: string) => void,
  ): () => void
  onExited(
    sessionId: SessionId,
    tabId: string,
    cb: (exitCode: number) => void,
  ): () => void
  onError(
    sessionId: SessionId,
    tabId: string,
    cb: (message: string) => void,
  ): () => void
  onOpened(sessionId: SessionId, tabId: string, cb: () => void): () => void
}

type TabKey = string
const tabKey = (sessionId: SessionId, tabId: string): TabKey =>
  `${sessionId}::${tabId}`

export const createTerminalClient = (
  send: (message: TerminalInbound) => void,
): TerminalClient => {
  const outputListeners = new Map<TabKey, (data: string) => void>()
  const exitListeners = new Map<TabKey, (exitCode: number) => void>()
  const errorListeners = new Map<TabKey, (message: string) => void>()
  const openedListeners = new Map<TabKey, () => void>()

  type Dispatcher = (message: TerminalOutbound, k: TabKey) => void
  const dispatchers: Map<TerminalOutbound["type"], Dispatcher> = new Map([
    [
      "term-opened",
      (m, k) => {
        if (m.type === "term-opened") openedListeners.get(k)?.()
      },
    ],
    [
      "term-output",
      (m, k) => {
        if (m.type === "term-output") outputListeners.get(k)?.(m.data)
      },
    ],
    [
      "term-exited",
      (m, k) => {
        if (m.type === "term-exited") exitListeners.get(k)?.(m.exitCode)
      },
    ],
    [
      "term-error",
      (m, k) => {
        if (m.type === "term-error") errorListeners.get(k)?.(m.message)
      },
    ],
  ])

  return {
    open: (input) =>
      send({
        type: "term-open",
        sessionId: input.sessionId,
        tabId: input.tabId as never,
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
        env: input.env,
      }),
    attach: (input) =>
      send({
        type: "term-attach",
        sessionId: input.sessionId,
        tabId: input.tabId as never,
      }),
    input: (input) =>
      send({
        type: "term-input",
        sessionId: input.sessionId,
        tabId: input.tabId as never,
        data: input.data,
      }),
    resize: (input) =>
      send({
        type: "term-resize",
        sessionId: input.sessionId,
        tabId: input.tabId as never,
        cols: input.cols,
        rows: input.rows,
      }),
    close: (input) =>
      send({
        type: "term-close",
        sessionId: input.sessionId,
        tabId: input.tabId as never,
      }),

    dispatch: (message) => {
      if (!isTerminalOutbound(message)) return
      const k = tabKey(message.sessionId, message.tabId)
      const dispatcher = dispatchers.get(message.type)
      if (typeof dispatcher !== "function") return
      dispatcher(message, k)
    },

    onOutput: (sessionId, tabId, cb) => {
      const k = tabKey(sessionId, tabId)
      outputListeners.set(k, cb)
      return () => {
        outputListeners.delete(k)
      }
    },
    onExited: (sessionId, tabId, cb) => {
      const k = tabKey(sessionId, tabId)
      exitListeners.set(k, cb)
      return () => {
        exitListeners.delete(k)
      }
    },
    onError: (sessionId, tabId, cb) => {
      const k = tabKey(sessionId, tabId)
      errorListeners.set(k, cb)
      return () => {
        errorListeners.delete(k)
      }
    },
    onOpened: (sessionId, tabId, cb) => {
      const k = tabKey(sessionId, tabId)
      openedListeners.set(k, cb)
      return () => {
        openedListeners.delete(k)
      }
    },
  }
}
