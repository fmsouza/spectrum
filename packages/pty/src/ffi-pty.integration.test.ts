import { describe, expect, it } from "bun:test"
import { createFfiPty } from "./ffi-pty"

describe("createFfiPty (real pty, macOS)", () => {
  it("gives the child a real TTY and streams its output", async () => {
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "tty; echo IS_TTY=$?"],
      env: { ...process.env } as Record<string, string>,
      cols: 80,
      rows: 24,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const out: string[] = []
    const exit = new Promise<number>((res) => opened.value.onExit(res))
    opened.value.onData((c) => out.push(new TextDecoder().decode(c)))
    const code = await exit
    const text = out.join("")
    expect(text).toContain("/dev/ttys")
    expect(text).toContain("IS_TTY=0")
    expect(code).toBe(0)
  })

  it("returns open-failed for an unspawnable command", () => {
    const res = createFfiPty().open({
      command: "/no/such/bin",
      args: [],
      env: {},
      cols: 80,
      rows: 24,
    })
    expect(res.ok).toBe(false)
  })
})
