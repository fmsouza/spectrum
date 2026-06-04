import { describe, expect, it } from "bun:test"
import type { PtyError } from "./pty"
import { createFakePty } from "./pty"

describe("createFakePty", () => {
  it("emits scripted data to the onData callback", () => {
    const pty = createFakePty()
    const chunks: string[] = []
    pty.onData((c) => chunks.push(new TextDecoder().decode(c)))
    pty.emit("hello")
    expect(chunks).toEqual(["hello"])
  })

  it("records writes and resizes", () => {
    const pty = createFakePty()
    pty.write(new TextEncoder().encode("ls\n"))
    pty.resize(120, 40)
    expect(pty.writes.map((w) => new TextDecoder().decode(w))).toEqual(["ls\n"])
    expect(pty.resizes).toEqual([{ cols: 120, rows: 40 }])
  })

  it("fires onExit with the code when killed or exited", () => {
    const pty = createFakePty()
    const codes: number[] = []
    pty.onExit((c) => {
      codes.push(c)
    })
    pty.triggerExit(137)
    expect(codes).toEqual([137])
  })
})

describe("PtyError", () => {
  it("includes a scrollback-io variant carrying a detail string when a store fs op fails", () => {
    const e: PtyError = { kind: "scrollback-io", detail: "ENOSPC" }
    expect(e.kind).toBe("scrollback-io")
    expect(e.detail).toBe("ENOSPC")
  })
})
