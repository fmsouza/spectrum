import { describe, expect, it } from "bun:test"
import { createFixedClock } from "@spectrum/utils"
import { createLogger, createNoopLogger } from "./logger"
import type { LogRecord, Sink } from "./types"

const capture = (): { sink: Sink; records: LogRecord[] } => {
  const records: LogRecord[] = []
  return { sink: { write: (r) => records.push(r) }, records }
}

const clock = createFixedClock(new Date("2026-06-15T10:00:00.000Z"))

describe("createLogger", () => {
  it("emits a record with ts, level, scope, msg and fields", () => {
    const { sink, records } = capture()
    const log = createLogger({ sinks: [sink], clock, minLevel: "debug" })
    log.info("hello", { a: 1 })
    expect(records).toEqual([
      {
        ts: "2026-06-15T10:00:00.000Z",
        level: "info",
        scope: "",
        msg: "hello",
        fields: { a: 1 },
      },
    ])
  })

  it("drops records below minLevel", () => {
    const { sink, records } = capture()
    const log = createLogger({ sinks: [sink], clock, minLevel: "warn" })
    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")
    expect(records.map((r) => r.level)).toEqual(["warn", "error"])
  })

  it("binds a dotted scope and merges fields via child", () => {
    const { sink, records } = capture()
    const log = createLogger({ sinks: [sink], clock, minLevel: "debug" })
    log
      .child("proxy", { reqId: "r1" })
      .child("router")
      .warn("miss", { model: "x" })
    expect(records[0]?.scope).toBe("proxy.router")
    expect(records[0]?.fields).toEqual({ reqId: "r1", model: "x" })
  })

  it("redacts secrets in msg and fields when a redact fn is provided", () => {
    const { sink, records } = capture()
    const log = createLogger({
      sinks: [sink],
      clock,
      minLevel: "debug",
      redact: (t) => t.replaceAll("sk-123", "[REDACTED]"),
    })
    log.error("auth failed for sk-123", { key: "sk-123" })
    expect(records[0]?.msg).toBe("auth failed for [REDACTED]")
    expect(records[0]?.fields).toEqual({ key: "[REDACTED]" })
  })

  it("fans out to every sink and a throwing sink does not break siblings or the caller", () => {
    const a = capture()
    const bad: Sink = {
      write: () => {
        throw new Error("boom")
      },
    }
    const c = capture()
    const log = createLogger({
      sinks: [a.sink, bad, c.sink],
      clock,
      minLevel: "debug",
    })
    expect(() => log.info("x")).not.toThrow()
    expect(a.records.length).toBe(1)
    expect(c.records.length).toBe(1)
  })

  it("omits fields when none are provided", () => {
    const { sink, records } = capture()
    const log = createLogger({ sinks: [sink], clock, minLevel: "debug" })
    log.info("no fields")
    expect(records[0]).toEqual({
      ts: "2026-06-15T10:00:00.000Z",
      level: "info",
      scope: "",
      msg: "no fields",
    })
  })
})

describe("createNoopLogger", () => {
  it("never throws and produces no output", () => {
    const log = createNoopLogger()
    expect(() => {
      log.debug("a")
      log.error("b", { x: 1 })
      log.child("s").info("c")
    }).not.toThrow()
  })
})
