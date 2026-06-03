import { describe, expect, it } from "bun:test"
import { bytesToBase64 } from "@launchkit/pty"
import { SessionIdSchema } from "@launchkit/types"
import { createTerminalClient } from "./terminalClient"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("createTerminalClient", () => {
  it("sends base64-encoded input as a pty-input message", () => {
    const sent: unknown[] = []
    const c = createTerminalClient((m) => sent.push(m))
    c.sendInput(id, new TextEncoder().encode("a"))
    expect(sent).toEqual([
      {
        type: "pty-input",
        id,
        data: bytesToBase64(new TextEncoder().encode("a")),
      },
    ])
  })

  it("sends attach/resize/kill messages", () => {
    const sent: unknown[] = []
    const c = createTerminalClient((m) => sent.push(m))
    c.attach(id)
    c.sendResize(id, 100, 30)
    c.kill(id)
    expect(sent).toEqual([
      { type: "pty-attach", id },
      { type: "pty-resize", id, cols: 100, rows: 30 },
      { type: "pty-kill", id },
    ])
  })

  it("dispatches pty-data to the registered data listener as decoded bytes", () => {
    const c = createTerminalClient(() => {})
    const got: string[] = []
    c.onData(id, (b) => got.push(new TextDecoder().decode(b)))
    c.dispatch({
      type: "pty-data",
      id,
      data: bytesToBase64(new TextEncoder().encode("hello")),
    })
    expect(got).toEqual(["hello"])
  })

  it("dispatches pty-exit to the registered exit listener with the code", () => {
    const c = createTerminalClient(() => {})
    const codes: number[] = []
    c.onExit(id, (x) => codes.push(x))
    c.dispatch({ type: "pty-exit", id, code: 5 })
    expect(codes).toEqual([5])
  })
})
