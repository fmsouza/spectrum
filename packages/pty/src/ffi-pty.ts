import { FFIType, dlopen, ptr } from "bun:ffi"
import { type Result, err, ok } from "@launchkit/utils"
import type { PtyAdapter, PtyError, PtyHandle, PtyOpenOptions } from "./pty"

// macOS termios / ioctl constants. Declared as bigints because they are passed as ioctl's `u64`
// request arg; a plain number ≥ 2^31 (bit 31 set, like 0x80087467) risks sign-extension to a bogus
// 64-bit request under bun:ffi. The harder defect — ioctl's struct-pointer is a VARIADIC arg that
// bun:ffi mis-passes on arm64 — is handled at the call sites: the initial size goes through openpty's
// FIXED `winp` parameter, and resize goes through a padded ioctl binding (see ioctlWinsize).
const TIOCSWINSZ = 0x80087467n
// Set non-blocking mode via ioctl(FIONBIO, &1). We deliberately do NOT use
// fcntl(F_SETFL, O_NONBLOCK): fcntl is variadic and bun:ffi does not pass the int vararg
// reliably on arm64, so O_NONBLOCK silently never applies — leaving the master fd BLOCKING.
// A blocking read() in the drain loop then freezes the whole Bun event loop the moment the
// harness idles (no output), killing all webview<->bun IPC. FIONBIO takes a POINTER arg, which
// the FFI passes correctly. (Verified: fcntl froze; ioctl(FIONBIO) stays non-blocking.)
const FIONBIO = 0x8004667en

// Drain the master fd on this cadence (ms).
const DRAIN_INTERVAL_MS = 10
const READ_BUFFER_BYTES = 65536

interface UtilSymbols {
  readonly openpty: (
    amaster: unknown,
    aslave: unknown,
    name: unknown,
    termp: unknown,
    winp: unknown,
  ) => number
}

interface LibcSymbols {
  readonly read: (
    fd: number,
    buf: unknown,
    count: number | bigint,
  ) => number | bigint
  readonly write: (
    fd: number,
    buf: unknown,
    count: number | bigint,
  ) => number | bigint
  readonly ioctl: (fd: number, request: number | bigint, arg: unknown) => number
  // ioctl for TIOCSWINSZ. The struct pointer is a VARIADIC arg, and on the arm64 Apple ABI all
  // variadic args are passed on the STACK — but bun:ffi passes every declared arg in a register. So
  // we declare 6 dummy register args (filling x2–x7) to push the real pointer onto the stack at
  // [sp+0], where the variadic ioctl actually reads it. Without this the pointer is mis-passed and the
  // kernel stores a garbage window size.
  readonly ioctlWinsize: (
    fd: number,
    request: number | bigint,
    pad0: number,
    pad1: number,
    pad2: number,
    pad3: number,
    pad4: number,
    pad5: number,
    arg: unknown,
  ) => number
  readonly close: (fd: number) => number
}

interface LoadedLibs {
  readonly util: UtilSymbols
  readonly libc: LibcSymbols
}

// Define FFI symbols once at module load. dlopen failure is captured (not thrown)
// so every open() can report it as an "open-failed" Result.
const loadLibs = (): Result<LoadedLibs, PtyError> => {
  try {
    const util = dlopen("libutil.dylib", {
      openpty: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
        returns: FFIType.int,
      },
    })
    const libc = dlopen("/usr/lib/libSystem.B.dylib", {
      read: {
        args: [FFIType.int, FFIType.ptr, FFIType.u64],
        returns: FFIType.i64,
      },
      write: {
        args: [FFIType.int, FFIType.ptr, FFIType.u64],
        returns: FFIType.i64,
      },
      ioctl: {
        args: [FFIType.int, FFIType.u64, FFIType.ptr],
        returns: FFIType.int,
      },
      close: { args: [FFIType.int], returns: FFIType.int },
    })
    // A SECOND binding of ioctl with 6 padding register args before the pointer, so TIOCSWINSZ's
    // variadic pointer is passed on the stack (see the ioctlWinsize interface comment). bun:ffi keys
    // a symbol by name, so this needs its own dlopen rather than another entry in the map above.
    const libcVar = dlopen("/usr/lib/libSystem.B.dylib", {
      ioctl: {
        args: [
          FFIType.int,
          FFIType.u64,
          FFIType.u64,
          FFIType.u64,
          FFIType.u64,
          FFIType.u64,
          FFIType.u64,
          FFIType.u64,
          FFIType.ptr,
        ],
        returns: FFIType.int,
      },
    })
    return ok({
      util: util.symbols as unknown as UtilSymbols,
      libc: {
        ...(libc.symbols as unknown as Omit<LibcSymbols, "ioctlWinsize">),
        ioctlWinsize: libcVar.symbols
          .ioctl as unknown as LibcSymbols["ioctlWinsize"],
      },
    })
  } catch (e) {
    return err({ kind: "open-failed", detail: `dlopen failed: ${String(e)}` })
  }
}

const loadedLibs = loadLibs()

// Persistent scratch for the 8-byte winsize struct (4 × u16 LE: [ws_row, ws_col, ws_xpixel,
// ws_ypixel]; word0 packs ws_row low-16 | ws_col high-16). MODULE-LEVEL on purpose: a freshly
// allocated per-call typed array was garbage-collected before the synchronous ioctl read it via
// bun:ffi `ptr()`, so the kernel stored a GARBAGE window size (`stty size` reported e.g. 45187×1786)
// and the harness rendered its TUI for a bogus width. A long-lived buffer (like the read buffer,
// which always worked) keeps `ptr()` valid. Safe to share across PTYs: each caller fills it fully and
// calls ioctl synchronously with no `await` in between, so the bytes can't be clobbered mid-call.
const winsizeScratch = new Int32Array(2)
const fillWinsize = (cols: number, rows: number): void => {
  winsizeScratch[0] = (rows & 0xffff) | ((cols & 0xffff) << 16)
  winsizeScratch[1] = 0
}

export const createFfiPty = (): PtyAdapter => ({
  open(opts: PtyOpenOptions): Result<PtyHandle, PtyError> {
    if (!loadedLibs.ok) return loadedLibs
    const { util, libc } = loadedLibs.value

    try {
      const master = new Int32Array(1)
      const slave = new Int32Array(1)
      // Set the initial window size via openpty's `winp` argument — a FIXED (non-variadic) parameter
      // that bun:ffi passes reliably. The post-spawn ioctl(TIOCSWINSZ) path is variadic and bun:ffi
      // mis-passes the vararg pointer on arm64 (same defect as fcntl), storing a GARBAGE winsize
      // (`stty size` reported e.g. 45187×1786) so the harness rendered its TUI for a bogus width.
      // openpty's fixed winp also sets the size ATOMICALLY before the child can read it (no race).
      fillWinsize(opts.cols, opts.rows)
      const rc = util.openpty(
        ptr(master),
        ptr(slave),
        null,
        null,
        ptr(winsizeScratch),
      )
      if (rc !== 0)
        return err({ kind: "open-failed", detail: `openpty rc=${rc}` })

      const masterFd = master[0] as number
      const slaveFd = slave[0] as number

      // openpty has allocated both fds. Any failure during the setup below
      // (spawn ENOENT, ioctl/fcntl, drain wiring) must close BOTH fds before
      // returning err, or each failed open leaks a master/slave fd pair. On the
      // SUCCESS path the slave is closed after spawn and the master on exit, so
      // this fallback only runs for an error before a successful return — it
      // never double-closes (slaveClosed gates the slave).
      let slaveClosed = false
      try {
        const child = Bun.spawn([opts.command, ...opts.args], {
          stdio: [slaveFd, slaveFd, slaveFd],
          ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
          // Inherit the parent environment (PATH/HOME/…) so the harness can resolve tools and read
          // its config dir. CRITICAL: advertise TERM=xterm-256color — this pty is rendered by
          // xterm.js (which emulates xterm-256color). A GUI app launched from Finder has NO TERM in
          // its environment, and without it the harness's TUI library falls back to broken rendering
          // (garbled box-drawing / no cursor positioning). COLORTERM enables 24-bit color. The
          // resolved proxy vars (opts.env) are spread LAST so the per-run proxy key + base URL
          // override any pre-existing ANTHROPIC_*/OPENAI_* in the user's shell.
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            ...opts.env,
          },
        })

        // The child now holds the slave fd; closing the parent's copy lets read()
        // on the master return EOF when the child exits (otherwise it blocks).
        libc.close(slaveFd)
        slaveClosed = true

        // (Initial window size already applied via openpty's winp above — see that call. We do NOT
        // re-apply it here with ioctl(TIOCSWINSZ): that path is variadic and bun:ffi mis-passes the
        // pointer on arm64, which would clobber the correct size openpty just set with garbage.)

        // Make the master non-blocking so reads return immediately (EAGAIN) when idle, instead of
        // blocking the event loop. Use ioctl(FIONBIO) — see the FIONBIO constant comment for why
        // fcntl(F_SETFL, O_NONBLOCK) does NOT work under bun:ffi on arm64.
        const nonblockFlag = new Int32Array([1])
        libc.ioctl(masterFd, FIONBIO, ptr(nonblockFlag))

        // Single-subscriber callback slots (read live by the drain loop / exit handler).
        let onDataCb: ((chunk: Uint8Array) => void) | null = null
        let onExitCb: ((code: number) => void) | null = null

        // Buffer any output produced before onData is first registered, then flush.
        const earlyBuffer: Uint8Array[] = []

        const buf = new Uint8Array(READ_BUFFER_BYTES)
        const drainOnce = (): void => {
          // Loop until EAGAIN so a single tick fully empties the kernel buffer.
          for (;;) {
            const n = Number(libc.read(masterFd, ptr(buf), buf.length))
            if (n <= 0) return
            const chunk = buf.slice(0, n)
            if (onDataCb) onDataCb(chunk)
            else earlyBuffer.push(chunk)
          }
        }

        const interval = setInterval(drainOnce, DRAIN_INTERVAL_MS)

        void child.exited.then((code: number) => {
          clearInterval(interval)
          drainOnce()
          libc.close(masterFd)
          onExitCb?.(code)
        })

        const handle: PtyHandle = {
          write: (data: Uint8Array): void => {
            libc.write(masterFd, ptr(data), data.length)
          },
          resize: (cols: number, rows: number): void => {
            // Use the padded ioctl so TIOCSWINSZ's variadic pointer lands on the stack (arm64). The
            // 6 zero pads fill x2–x7; ptr(winsizeScratch) becomes the first stack arg the call reads.
            fillWinsize(cols, rows)
            libc.ioctlWinsize(
              masterFd,
              TIOCSWINSZ,
              0,
              0,
              0,
              0,
              0,
              0,
              ptr(winsizeScratch),
            )
          },
          onData: (cb: (chunk: Uint8Array) => void): void => {
            onDataCb = cb
            if (earlyBuffer.length > 0) {
              for (const chunk of earlyBuffer) cb(chunk)
              earlyBuffer.length = 0
            }
          },
          onExit: (cb: (code: number) => void): void => {
            onExitCb = cb
          },
          kill: (): void => {
            child.kill()
          },
        }

        return ok(handle)
      } catch (e) {
        // Reclaim the fds openpty allocated. Close the slave only if spawn
        // succeeded but a later step failed before it was already closed.
        if (!slaveClosed) libc.close(slaveFd)
        libc.close(masterFd)
        return err({ kind: "open-failed", detail: String(e) })
      }
    } catch (e) {
      return err({ kind: "open-failed", detail: String(e) })
    }
  },
})
