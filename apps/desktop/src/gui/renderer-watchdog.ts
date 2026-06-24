import type { Logger } from "@spectrum/logger"

/** Injected timer seam so the state machine is unit-testable with a manual queue. */
export interface WatchdogTimers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/** Real adapter over the global timer functions (used by composition). */
export const realWatchdogTimers: WatchdogTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface RendererWatchdogDeps {
  readonly timers: WatchdogTimers
  readonly logger: Logger
  /** How long a disconnect must persist before we presume the renderer is dead. */
  readonly graceMs?: number
  /** Max reload attempts before giving up and surfacing to the user. */
  readonly maxAttempts?: number
  /** Delay before re-checking after a reload attempt (waits for the SPA to reconnect). */
  readonly backoffMs?: (attempt: number) => number
  /** Called once we stop retrying — wire to a native notification (the webview is dead). */
  readonly onGiveUp?: () => void
}

export interface RendererWatchdog {
  /** The runner socket connected — renderer is alive. Cancels any pending reload. */
  onConnect(): void
  /** The runner socket closed — renderer may be dead. Starts the grace timer. */
  onDisconnect(): void
  /** Late-bind the reload effect (the webview exists only after the window opens). */
  bindReload(reload: () => void): void
  /** Cancel any pending timer (tests / shutdown). */
  dispose(): void
}

/**
 * Watches the renderer's liveness via the runner-socket connect/disconnect signal.
 * Electrobun 1.18.1 surfaces no WKWebView content-process-termination event, so a
 * prolonged runner-socket disconnect is our best proxy for "the renderer died".
 * On a sustained disconnect we reload the webview (respawns the WKWebView content
 * process); a reconnect cancels the pending reload. After `maxAttempts` failed
 * reloads we give up and surface (the webview is unrecoverable; the user must restart).
 */
export const createRendererWatchdog = (
  deps: RendererWatchdogDeps,
): RendererWatchdog => {
  const graceMs = deps.graceMs ?? 5000
  const maxAttempts = deps.maxAttempts ?? 5
  const backoffMs =
    deps.backoffMs ?? ((n: number): number => Math.min(30000, 4000 * n))

  let reload: (() => void) | null = null
  let connected = false
  let attempts = 0
  let timer: unknown = null

  const clearTimer = (): void => {
    if (timer !== null) {
      deps.timers.clearTimeout(timer)
      timer = null
    }
  }

  const schedule = (ms: number): void => {
    clearTimer()
    timer = deps.timers.setTimeout(runCheck, ms)
  }

  function runCheck(): void {
    timer = null
    if (connected) return // recovered before the timer fired
    if (attempts >= maxAttempts) {
      deps.logger.fatal("renderer did not recover after reload attempts", {
        attempts,
      })
      deps.onGiveUp?.()
      return
    }
    attempts += 1
    deps.logger.warn("reloading dead renderer", { attempt: attempts })
    if (reload === null) {
      deps.logger.warn("renderer reload requested before webview ready")
    } else {
      reload()
    }
    schedule(backoffMs(attempts)) // wait for the SPA to reconnect; retry if not
  }

  return {
    onConnect: () => {
      deps.logger.info("renderer connected")
      connected = true
      attempts = 0
      clearTimer()
    },
    onDisconnect: () => {
      deps.logger.warn("renderer disconnected")
      connected = false
      schedule(graceMs)
    },
    bindReload: (fn) => {
      reload = fn
    },
    dispose: clearTimer,
  }
}
