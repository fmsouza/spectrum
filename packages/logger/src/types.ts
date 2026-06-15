/** Severity levels, lowest to highest. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal"

/** A single structured log entry after filtering + redaction. */
export type LogRecord = {
  readonly ts: string
  readonly level: LogLevel
  readonly scope: string
  readonly msg: string
  readonly fields?: Readonly<Record<string, unknown>>
}

/**
 * Fire-and-forget structured logger. Every method returns void and never throws;
 * a failing sink is swallowed internally. `child` binds a dotted scope + default fields.
 */
export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  fatal(msg: string, fields?: Record<string, unknown>): void
  child(scope: string, fields?: Record<string, unknown>): Logger
}

/** A destination for log records (console, file, browser console, …). */
export interface Sink {
  write(record: LogRecord): void
}
