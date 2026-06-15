import { describe, expect, it } from "bun:test"
import type { Logger } from "@spectrum/logger"
import { isErr, isOk } from "@spectrum/utils"
import { createSqliteClient } from "./client"

type Captured = {
  readonly level: "warn" | "error"
  readonly msg: string
  readonly fields: Record<string, unknown> | undefined
}

const makeFakeLogger = (captured: Captured[]): Logger => {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: (msg, fields) => {
      captured.push({ level: "warn", msg, fields })
    },
    error: (msg, fields) => {
      captured.push({ level: "error", msg, fields })
    },
    fatal: () => {},
    child: () => logger,
  }
  return logger
}

describe("createSqliteClient", () => {
  it("returns ok with a usable handle and connection for an in-memory db", () => {
    const r = createSqliteClient(":memory:")
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value.handle).toBeDefined()
    expect(r.value.connection).toBeDefined()
  })

  it("returns err open-failed when the path cannot be opened", () => {
    // A path whose parent directory does not exist cannot be opened.
    const r = createSqliteClient("/nonexistent-dir-xyz/does/not/exist.db")
    expect(isErr(r) && r.error.kind).toBe("open-failed")
  })

  it("logs error with detail when open fails, given an injected logger", () => {
    const captured: Captured[] = []
    const logger = makeFakeLogger(captured)

    const r = createSqliteClient("/nonexistent-dir-xyz/does/not/exist.db", {
      logger,
    })

    // Logging is observation, not control flow — the Result is unchanged.
    expect(isErr(r) && r.error.kind).toBe("open-failed")

    expect(captured).toHaveLength(1)
    const entry = captured[0]
    expect(entry?.level).toBe("error")
    expect(entry?.msg).toBe("sqlite open failed")
    expect(typeof entry?.fields?.detail).toBe("string")
  })

  it("does not log on success", () => {
    const captured: Captured[] = []
    const r = createSqliteClient(":memory:", {
      logger: makeFakeLogger(captured),
    })
    expect(isOk(r)).toBe(true)
    expect(captured).toHaveLength(0)
  })
})
