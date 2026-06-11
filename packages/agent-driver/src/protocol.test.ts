import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { decodeRunnerInbound } from "./protocol"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("decodeRunnerInbound", () => {
  it("decodes a run-attach message", () => {
    const r = decodeRunnerInbound({ type: "run-attach", id })
    expect(r.ok && r.value).toEqual({ type: "run-attach", id })
  })

  it("decodes a run-send message with text", () => {
    const r = decodeRunnerInbound({ type: "run-send", id, text: "hi" })
    expect(r.ok && r.value).toEqual({ type: "run-send", id, text: "hi" })
  })

  it("decodes a run-approve message with a requestId and decision", () => {
    const r = decodeRunnerInbound({
      type: "run-approve",
      id,
      requestId: "req_1",
      decision: "allow",
    })
    expect(r.ok && r.value).toEqual({
      type: "run-approve",
      id,
      requestId: "req_1",
      decision: "allow",
    })
  })

  it("decodes a run-interrupt message", () => {
    const r = decodeRunnerInbound({ type: "run-interrupt", id })
    expect(r.ok && r.value).toEqual({ type: "run-interrupt", id })
  })

  it("rejects an unknown decision on run-approve as bad-message", () => {
    const r = decodeRunnerInbound({
      type: "run-approve",
      id,
      requestId: "req_1",
      decision: "maybe",
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.kind).toBe("bad-message")
  })

  it("rejects an unknown message type as bad-message", () => {
    const r = decodeRunnerInbound({ type: "pty-input", id, data: "x" })
    expect(!r.ok && r.error.kind).toBe("bad-message")
  })

  it("rejects a non-object payload as bad-message", () => {
    expect(decodeRunnerInbound("nope").ok).toBe(false)
  })

  it("decodes a run-set-mode message", () => {
    const r = decodeRunnerInbound({ type: "run-set-mode", id, mode: "plan" })
    expect(r.ok && r.value).toEqual({ type: "run-set-mode", id, mode: "plan" })
  })

  it("rejects an unknown mode on run-set-mode as bad-message", () => {
    const r = decodeRunnerInbound({ type: "run-set-mode", id, mode: "yolo" })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.kind).toBe("bad-message")
  })
})
