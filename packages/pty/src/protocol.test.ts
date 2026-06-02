import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { decodeInbound, encodeData, encodeExit } from "./protocol"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("pty protocol", () => {
  it("encodes pty output bytes as a base64 pty-data message", () => {
    expect(encodeData(id, new TextEncoder().encode("hi"))).toEqual({
      type: "pty-data",
      id,
      data: btoa("hi"),
    })
  })

  it("encodes an exit message with the code", () => {
    expect(encodeExit(id, 2)).toEqual({ type: "pty-exit", id, code: 2 })
  })

  it("decodes a valid pty-input message", () => {
    const parsed = decodeInbound({ type: "pty-input", id, data: btoa("ls\n") })
    expect(parsed.ok && parsed.value).toEqual({
      type: "pty-input",
      id,
      data: btoa("ls\n"),
    })
  })

  it("rejects a malformed inbound message", () => {
    expect(decodeInbound({ type: "nope" }).ok).toBe(false)
  })
})
