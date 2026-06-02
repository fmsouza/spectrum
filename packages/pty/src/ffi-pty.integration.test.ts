import { describe, expect, it } from "bun:test"
import { execSync } from "node:child_process"
import { readdirSync } from "node:fs"
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

  it("does not leak file descriptors when the command cannot be spawned", () => {
    const adapter = createFfiPty()
    const countFds = (): number => {
      try {
        const out = execSync(`lsof -p ${process.pid} 2>/dev/null | wc -l`, {
          encoding: "utf8",
        })
        return Number(out.trim())
      } catch {
        return readdirSync("/dev/fd").length
      }
    }
    const badOpts = {
      command: "/no/such/bin",
      args: [] as string[],
      env: {} as Record<string, string>,
      cols: 80,
      rows: 24,
    }
    // Warm-up: stabilize any one-time allocations so the delta isolates the leak.
    for (let i = 0; i < 5; i++) adapter.open(badOpts)
    const before = countFds()
    for (let i = 0; i < 20; i++) adapter.open(badOpts)
    const after = countFds()
    // A per-open 2-fd leak over 20 opens (=40) must not appear; allow tiny noise.
    expect(after - before).toBeLessThan(10)
  })
})
