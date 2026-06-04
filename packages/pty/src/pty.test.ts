import { describe, expect, it } from "bun:test"
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
