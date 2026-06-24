import { describe, expect, it } from "bun:test"
import type { Logger } from "@spectrum/logger"
import { createRendererWatchdog } from "./renderer-watchdog"
import type { WatchdogTimers } from "./renderer-watchdog"

const noopLogger = (): Logger =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => noopLogger(),
  }) as unknown as Logger

// A controllable timer seam: pending callbacks are flushed manually by the test.
const makeTimers = (): {
  timers: WatchdogTimers
  flushNext: () => void
  pending: () => number
  delays: number[]
} => {
  let queue: Array<{ id: number; fn: () => void }> = []
  let nextId = 1
  const delays: number[] = []
  const timers: WatchdogTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++
      queue.push({ id, fn })
      delays.push(ms)
      return id
    },
    clearTimeout: (handle) => {
      queue = queue.filter((e) => e.id !== handle)
    },
  }
  return {
    timers,
    flushNext: () => {
      const next = queue.shift()
      next?.fn()
    },
    pending: () => queue.length,
    delays,
  }
}

describe("createRendererWatchdog", () => {
  it("reloads the webview when the renderer stays disconnected past the grace window", () => {
    const { timers, flushNext } = makeTimers()
    let reloads = 0
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect()
    expect(reloads).toBe(0)
    flushNext() // grace elapses with no reconnect
    expect(reloads).toBe(1)
  })

  it("does not reload when the renderer reconnects before the grace window elapses", () => {
    const { timers, flushNext, pending } = makeTimers()
    let reloads = 0
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect()
    wd.onConnect() // reconnected in time → pending grace timer cancelled
    expect(pending()).toBe(0)
    flushNext() // no-op (queue empty)
    expect(reloads).toBe(0)
  })

  it("retries the reload after backoff when the renderer does not come back", () => {
    const { timers, flushNext } = makeTimers()
    let reloads = 0
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect()
    flushNext() // grace → reload #1, schedules a backoff re-check
    flushNext() // backoff → reload #2
    expect(reloads).toBe(2)
  })

  it("gives up and surfaces after maxAttempts reloads without recovery", () => {
    const { timers, flushNext } = makeTimers()
    let reloads = 0
    let gaveUp = false
    const wd = createRendererWatchdog({
      timers,
      logger: noopLogger(),
      maxAttempts: 2,
      onGiveUp: () => {
        gaveUp = true
      },
    })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect()
    flushNext() // reload #1
    flushNext() // reload #2
    flushNext() // attempts exhausted → give up, no reload #3
    expect(reloads).toBe(2)
    expect(gaveUp).toBe(true)
  })

  it("resets the attempt count after a successful reconnect", () => {
    const { timers, flushNext } = makeTimers()
    let reloads = 0
    let gaveUp = false
    const wd = createRendererWatchdog({
      timers,
      logger: noopLogger(),
      maxAttempts: 1,
      onGiveUp: () => {
        gaveUp = true
      },
    })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect()
    flushNext() // reload #1 (attempt 1/1)
    wd.onConnect() // recovered → attempts reset to 0
    wd.onDisconnect()
    flushNext() // reload again (attempt 1/1 of a fresh cycle), not "give up"
    expect(reloads).toBe(2)
    expect(gaveUp).toBe(false)
  })

  it("does not throw when a reload is requested before bindReload is called", () => {
    const { timers, flushNext } = makeTimers()
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.onDisconnect()
    expect(() => flushNext()).not.toThrow()
  })

  it("ignores a duplicate disconnect while already tracking, preserving retry progress", () => {
    const { timers, flushNext, delays } = makeTimers()
    let reloads = 0
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.bindReload(() => {
      reloads += 1
    })
    wd.onDisconnect() // arms the grace timer (5000ms)
    flushNext() // grace elapses → reload #1, schedules backoff(1) = 4000ms
    // Simulate Bun delivering a duplicate close while the backoff timer is pending
    wd.onDisconnect() // duplicate — must NOT re-arm and reset the delay to grace
    flushNext() // should continue with backoff delay, not restart grace → reload #2, schedules backoff(2) = 8000ms
    // With the guard, the duplicate is ignored and we see [5000, 4000, 8000].
    // Without the guard, the duplicate would reset to grace: [5000, 5000, 8000] (extra grace delay).
    expect(delays).toEqual([5000, 4000, 8000])
    expect(reloads).toBe(2)
  })

  it("schedules the post-reload re-check using the backoff for the attempt", () => {
    const { timers, flushNext, delays } = makeTimers()
    const wd = createRendererWatchdog({ timers, logger: noopLogger() })
    wd.bindReload(() => {})
    wd.onDisconnect() // grace timer: 5000
    flushNext() // grace → reload #1, schedules backoff(1) = 4000
    expect(delays).toEqual([5000, 4000])
  })
})
