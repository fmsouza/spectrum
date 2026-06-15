import { describe, expect, it } from "bun:test"
import type { LogLevel, LogRecord } from "./index"

describe("@spectrum/logger types", () => {
  it("exposes the LogRecord shape", () => {
    const level: LogLevel = "info"
    const r: LogRecord = { ts: "t", level, scope: "x", msg: "hi" }
    expect(r.level).toBe("info")
  })
})
