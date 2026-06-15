import { describe, expect, it } from "bun:test"
import { createConsoleSink } from "./console-sink"
import type { LogRecord } from "./types"

const rec: LogRecord = {
  ts: "2026-06-15T10:00:00.000Z",
  level: "warn",
  scope: "proxy",
  msg: "slow",
  fields: { ms: 1200 },
}

describe("createConsoleSink", () => {
  it("writes one JSON line when pretty is false", () => {
    const lines: string[] = []
    const sink = createConsoleSink({
      write: (l) => lines.push(l),
      pretty: false,
    })
    sink.write(rec)
    expect(lines).toEqual([`${JSON.stringify(rec)}\n`])
  })

  it("writes a readable single line when pretty is true", () => {
    const lines: string[] = []
    const sink = createConsoleSink({
      write: (l) => lines.push(l),
      pretty: true,
    })
    sink.write(rec)
    expect(lines[0]).toBe("10:00:00 WARN [proxy] slow ms=1200\n")
  })

  it("omits the field section when there are no fields", () => {
    const lines: string[] = []
    const sink = createConsoleSink({
      write: (l) => lines.push(l),
      pretty: true,
    })
    sink.write({
      ts: "2026-06-15T10:00:00.000Z",
      level: "info",
      scope: "app",
      msg: "up",
    })
    expect(lines[0]).toBe("10:00:00 INFO [app] up\n")
  })
})
