import type { Clock } from "@spectrum/utils"
import type { LogLevel, LogRecord, Logger, Sink } from "./types"

const RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
}

/**
 * Build a logger that timestamps + filters by `minLevel`, redacts, and fans out to sinks.
 * Returns void and never throws (a sink fault is swallowed). `redact` (default identity)
 * scrubs the msg and the JSON of fields before any sink sees them.
 */
export const createLogger = (deps: {
  readonly sinks: readonly Sink[]
  readonly clock: Clock
  readonly minLevel: LogLevel
  readonly redact?: (text: string) => string
}): Logger => {
  const redact = deps.redact ?? ((t: string): string => t)

  const make = (scope: string, baseFields: Record<string, unknown>): Logger => {
    const emit = (
      level: LogLevel,
      msg: string,
      fields?: Record<string, unknown>,
    ): void => {
      if (RANK[level] < RANK[deps.minLevel]) return
      const merged = { ...baseFields, ...(fields ?? {}) }
      const hasFields = Object.keys(merged).length > 0
      // Serialize→redact→parse can throw on non-JSON-serializable values
      // (bigint, circular refs). Logging must never throw, so on failure we
      // drop the fields and still emit the (redacted) msg.
      let safeFields: Record<string, unknown> | undefined
      if (hasFields) {
        try {
          safeFields = JSON.parse(redact(JSON.stringify(merged))) as Record<
            string,
            unknown
          >
        } catch {
          safeFields = undefined
        }
      }
      const record: LogRecord = {
        ts: deps.clock.now().toISOString(),
        level,
        scope,
        msg: redact(msg),
        ...(safeFields !== undefined ? { fields: safeFields } : {}),
      }
      for (const sink of deps.sinks) {
        try {
          sink.write(record)
        } catch {
          // Logging must never throw — drop a faulty sink's error.
        }
      }
    }

    return {
      debug: (m, f) => emit("debug", m, f),
      info: (m, f) => emit("info", m, f),
      warn: (m, f) => emit("warn", m, f),
      error: (m, f) => emit("error", m, f),
      fatal: (m, f) => emit("fatal", m, f),
      child: (childScope, childFields) =>
        make(scope === "" ? childScope : `${scope}.${childScope}`, {
          ...baseFields,
          ...(childFields ?? {}),
        }),
    }
  }

  return make("", {})
}

/** A logger that does nothing — the default where no real logger is injected. */
export const createNoopLogger = (): Logger => {
  const noop = (): void => {}
  const self: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => self,
  }
  return self
}
