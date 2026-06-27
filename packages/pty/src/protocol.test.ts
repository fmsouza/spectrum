import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@spectrum/types"
import { decodeTerminalInbound } from "./protocol"

const sessionId = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")
const validTabId = "11111111-1111-4111-8111-111111111111"

describe("decodeTerminalInbound", () => {
  it("accepts a term-open frame", () => {
    const frame = {
      type: "term-open",
      sessionId,
      tabId: validTabId,
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    }
    const r = decodeTerminalInbound(frame)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.type).toBe("term-open")
  })

  it("accepts a term-input frame with base64 data", () => {
    const frame = {
      type: "term-input",
      sessionId,
      tabId: validTabId,
      data: "aGVsbG8=", // "hello" base64
    }
    const r = decodeTerminalInbound(frame)
    expect(r.ok).toBe(true)
  })

  it("rejects a term-input frame with non-base64 data", () => {
    const frame = {
      type: "term-input",
      sessionId,
      tabId: validTabId,
      data: "not!!!base64===",
    }
    const r = decodeTerminalInbound(frame)
    expect(r.ok).toBe(false)
  })

  it("rejects an unknown frame type", () => {
    const r = decodeTerminalInbound({ type: "term-bogus", sessionId, tabId: validTabId })
    expect(r.ok).toBe(false)
  })

  it("rejects a frame with a non-uuid tabId", () => {
    const r = decodeTerminalInbound({
      type: "term-open",
      sessionId,
      tabId: "not-a-uuid",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    })
    expect(r.ok).toBe(false)
  })

  it("accepts a term-attach frame", () => {
    const r = decodeTerminalInbound({ type: "term-attach", sessionId, tabId: validTabId })
    expect(r.ok).toBe(true)
  })

  it("accepts a term-resize frame", () => {
    const r = decodeTerminalInbound({
      type: "term-resize", sessionId, tabId: validTabId, cols: 120, rows: 40,
    })
    expect(r.ok).toBe(true)
  })

  it("accepts a term-close frame", () => {
    const r = decodeTerminalInbound({ type: "term-close", sessionId, tabId: validTabId })
    expect(r.ok).toBe(true)
  })
})
