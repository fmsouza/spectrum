import type { LogRecord, Sink } from "./types"

const formatFields = (fields: Readonly<Record<string, unknown>>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ")

/**
 * Console sink over an injected line writer (real wiring passes process.stderr.write).
 * `pretty` → `HH:MM:SS LEVEL [scope] msg k=v …`; otherwise one JSON line.
 */
export const createConsoleSink = (deps: {
  readonly write: (line: string) => void
  readonly pretty: boolean
}): Sink => ({
  write: (record: LogRecord): void => {
    if (!deps.pretty) {
      deps.write(`${JSON.stringify(record)}\n`)
      return
    }
    const time = record.ts.slice(11, 19)
    const fields =
      record.fields !== undefined && Object.keys(record.fields).length > 0
        ? ` ${formatFields(record.fields)}`
        : ""
    deps.write(
      `${time} ${record.level.toUpperCase()} [${record.scope}] ${record.msg}${fields}\n`,
    )
  },
})
