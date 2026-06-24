import { describe, expect, it } from "bun:test"
import type { RunManager } from "@spectrum/agent-driver"
import type { Logger } from "@spectrum/logger"
import { createRendererWatchdog } from "./renderer-watchdog"
import type { WatchdogTimers } from "./renderer-watchdog"
import { makeRunnerSocketHandlers } from "./runner-socket"
import { bindWebviewReload } from "./window"

const noopLogger = (): Logger =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => noopLogger(),
  }) as unknown as Logger

const stubManager = (): RunManager =>
  ({
    launch: () => ({ ok: true, value: { sessionId: "s" } }),
    handleInbound: () => {},
    bindSend: () => {},
    markUserNamed: () => {},
  }) as unknown as RunManager

const makeTimers = (): { timers: WatchdogTimers; flushNext: () => void } => {
  let queue: Array<{ id: number; fn: () => void }> = []
  let nextId = 1
  return {
    timers: {
      setTimeout: (fn) => {
        const id = nextId++
        queue.push({ id, fn })
        return id
      },
      clearTimeout: (h) => {
        queue = queue.filter((e) => e.id !== h)
      },
    },
    flushNext: () => queue.shift()?.fn(),
  }
}

describe("renderer recovery (socket ⇄ watchdog ⇄ webview reload)", () => {
  it("reloads the webview when the runner socket closes and does not reconnect", () => {
    const { timers, flushNext } = makeTimers()
    const loaded: string[] = []
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    bindWebviewReload(
      { webview: { loadURL: (u) => loaded.push(u) } },
      "views://main/index.html",
      (reload) => wd.bindReload(reload),
    )
    const handlers = makeRunnerSocketHandlers(stubManager(), {
      onConnect: () => wd.onConnect(),
      onDisconnect: () => wd.onDisconnect(),
    })
    handlers.open({ send: () => {} }) // initial connect
    handlers.close() // renderer dies → grace timer armed
    flushNext() // grace elapses → reload
    expect(loaded).toEqual(["views://main/index.html"])
  })

  it("does not reload when the renderer reconnects within the grace window", () => {
    const { timers, flushNext } = makeTimers()
    const loaded: string[] = []
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    bindWebviewReload(
      { webview: { loadURL: (u) => loaded.push(u) } },
      "views://main/index.html",
      (reload) => wd.bindReload(reload),
    )
    const handlers = makeRunnerSocketHandlers(stubManager(), {
      onConnect: () => wd.onConnect(),
      onDisconnect: () => wd.onDisconnect(),
    })
    handlers.open({ send: () => {} })
    handlers.close()
    handlers.open({ send: () => {} }) // SPA reconnected (e.g. Layer-2 self-reload)
    flushNext()
    expect(loaded).toEqual([])
  })
})
