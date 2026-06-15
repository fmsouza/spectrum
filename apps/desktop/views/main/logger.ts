import { type Logger, type Sink, createLogger } from "@spectrum/logger"

type ConsoleLike = {
  debug: (...a: unknown[]) => void
  info: (...a: unknown[]) => void
  warn: (...a: unknown[]) => void
  error: (...a: unknown[]) => void
}

/** A sink that routes each record to the matching browser console method (fatal → error). */
export const createBrowserConsoleSink = (c: ConsoleLike): Sink => ({
  write: (record) => {
    const line = `[${record.scope}] ${record.msg}`
    const args = record.fields !== undefined ? [line, record.fields] : [line]
    switch (record.level) {
      case "debug":
        c.debug(...args)
        return
      case "info":
        c.info(...args)
        return
      case "warn":
        c.warn(...args)
        return
      default:
        c.error(...args)
    }
  },
})

type ForwardParams = {
  readonly scope: string
  readonly level: "error" | "fatal"
  readonly msg: string
  readonly fields?: Record<string, unknown>
}

/**
 * Build the webview logger: logs all levels to the browser console, and additionally
 * forwards error/fatal to the main process (which persists them to the log file).
 * `forward` is the IPC `logClientError` call (fire-and-forget). `console` defaults to the
 * global browser console so call sites need not reference it (keeps `console` out of app.tsx).
 */
export const createWebviewLogger = (deps: {
  readonly console?: ConsoleLike
  readonly forward: (p: ForwardParams) => Promise<unknown>
}): Logger => {
  const consoleLike = deps.console ?? globalThis.console
  const forwardSink: Sink = {
    write: (record) => {
      if (record.level === "error" || record.level === "fatal") {
        void deps.forward({
          scope: record.scope,
          level: record.level,
          msg: record.msg,
          ...(record.fields !== undefined
            ? { fields: { ...record.fields } }
            : {}),
        })
      }
    },
  }
  return createLogger({
    sinks: [createBrowserConsoleSink(consoleLike), forwardSink],
    clock: { now: () => new Date() },
    minLevel: "debug",
  })
}
