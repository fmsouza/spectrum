import { FFIType, dlopen, ptr } from "bun:ffi"
import { type Result, err, ok } from "@launchkit/utils"
import type { PtyAdapter, PtyError, PtyHandle, PtyOpenOptions } from "./pty"

// macOS termios / fcntl constants.
const TIOCSWINSZ = 0x80087467
const F_SETFL = 4
const O_NONBLOCK = 0x0004

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
  readonly fcntl: (fd: number, cmd: number, arg: number) => number
  readonly ioctl: (fd: number, request: number | bigint, arg: unknown) => number
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
      fcntl: {
        args: [FFIType.int, FFIType.int, FFIType.int],
        returns: FFIType.int,
      },
      ioctl: {
        args: [FFIType.int, FFIType.u64, FFIType.ptr],
        returns: FFIType.int,
      },
      close: { args: [FFIType.int], returns: FFIType.int },
    })
    return ok({
      util: util.symbols as unknown as UtilSymbols,
      libc: libc.symbols as unknown as LibcSymbols,
    })
  } catch (e) {
    return err({ kind: "open-failed", detail: `dlopen failed: ${String(e)}` })
  }
}

const loadedLibs = loadLibs()

// Build the 8-byte winsize struct: 4 × u16 LE [ws_row, ws_col, ws_xpixel, ws_ypixel].
const makeWinsize = (cols: number, rows: number): Uint16Array => {
  const ws = new Uint16Array(4)
  ws[0] = rows
  ws[1] = cols
  ws[2] = 0
  ws[3] = 0
  return ws
}

export const createFfiPty = (): PtyAdapter => ({
  open(opts: PtyOpenOptions): Result<PtyHandle, PtyError> {
    if (!loadedLibs.ok) return loadedLibs
    const { util, libc } = loadedLibs.value

    try {
      const master = new Int32Array(1)
      const slave = new Int32Array(1)
      const rc = util.openpty(ptr(master), ptr(slave), null, null, null)
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
          env: { ...opts.env },
        })

        // The child now holds the slave fd; closing the parent's copy lets read()
        // on the master return EOF when the child exits (otherwise it blocks).
        libc.close(slaveFd)
        slaveClosed = true

        // Apply the initial window size.
        const ws = makeWinsize(opts.cols, opts.rows)
        libc.ioctl(masterFd, TIOCSWINSZ, ptr(ws))

        // Make the master non-blocking so reads return immediately when idle.
        libc.fcntl(masterFd, F_SETFL, O_NONBLOCK)

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
            const next = makeWinsize(cols, rows)
            libc.ioctl(masterFd, TIOCSWINSZ, ptr(next))
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
