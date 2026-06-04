import { describe, expect, it } from "bun:test"
import { execSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { createFfiPty } from "./ffi-pty"

// `createFfiPty` is macOS-only: it dlopens `libutil.dylib` and uses macOS ioctl request codes. On
// other platforms (e.g. Linux CI) the dlopen fails and every open() returns an error, so these real-
// pty assertions can't run — skip the whole suite off darwin. The adapter's logic is covered cross-
// platform via `createFakePty` in the manager/registry unit tests.
const describeMac = describe.skipIf(process.platform !== "darwin")

describeMac("createFfiPty (real pty, macOS)", () => {
  it("stays non-blocking (event loop alive) while the harness idles between outputs", async () => {
    // Regression for the freeze bug: the master fd MUST be non-blocking, or the drain loop's
    // read() blocks the whole Bun event loop the moment the harness goes idle (no output) —
    // killing all webview<->bun IPC until the process is restarted. (fcntl(F_SETFL,O_NONBLOCK)
    // silently failed under bun:ffi on arm64; the fix uses ioctl(FIONBIO).) The original tests
    // used a command that exits immediately and never exercised the idle window.
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "echo FIRST; sleep 0.6; echo SECOND"],
      env: { ...process.env } as Record<string, string>,
      cols: 80,
      rows: 24,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const chunks: string[] = []
    opened.value.onData((c) => chunks.push(new TextDecoder().decode(c)))
    // If the event loop were frozen by a blocking read during the ~600ms idle, this timer would
    // not tick and the exit promise below would never resolve (the test would time out).
    let ticks = 0
    const timer = setInterval(() => {
      ticks++
    }, 100)
    const code = await new Promise<number>((res) => opened.value.onExit(res))
    clearInterval(timer)
    const text = chunks.join("")
    expect(code).toBe(0)
    expect(text).toContain("FIRST")
    expect(text).toContain("SECOND")
    expect(ticks).toBeGreaterThanOrEqual(3)
  })

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

  it("sets the window size the child's TTY reports (TIOCSWINSZ via openpty winp)", async () => {
    // Regression for the garbled-TUI bug: ioctl(TIOCSWINSZ)'s struct pointer is a VARIADIC arg, and
    // bun:ffi mis-passes the vararg on arm64, so the post-spawn ioctl stored a GARBAGE winsize (stty
    // reported e.g. 45187×1786). The harness then rendered its TUI for a ~1786-col terminal — stray
    // wrapped lines, content at impossible columns. The fix sets the size via openpty's FIXED `winp`
    // arg. `stty size` prints "<rows> <cols>", so the child must see exactly the size we asked for.
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "stty size"],
      env: { ...process.env } as Record<string, string>,
      cols: 92,
      rows: 34,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const out: string[] = []
    const exit = new Promise<number>((res) => opened.value.onExit(res))
    opened.value.onData((c) => out.push(new TextDecoder().decode(c)))
    await exit
    expect(out.join("")).toContain("34 92")
  })

  it("applies a resize to the child's TTY (padded variadic ioctl)", async () => {
    // Resize goes through ioctl(TIOCSWINSZ) directly (no openpty). The padded-args trick pushes the
    // variadic pointer onto the stack where the kernel reads it; without it, a window resize would
    // reflow the harness to a garbage size. The child sleeps, we resize, then it reports stty size.
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "sleep 0.3; stty size"],
      env: { ...process.env } as Record<string, string>,
      cols: 92,
      rows: 34,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const out: string[] = []
    const exit = new Promise<number>((res) => opened.value.onExit(res))
    opened.value.onData((c) => out.push(new TextDecoder().decode(c)))
    setTimeout(() => opened.value.resize(100, 40), 100)
    await exit
    expect(out.join("")).toContain("40 100")
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
