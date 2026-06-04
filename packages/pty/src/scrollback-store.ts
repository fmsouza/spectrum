import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs"
import type { SessionId } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import type { PtyError } from "./pty"

/** A sequential append writer: open once, write N times, close once. */
export interface ScrollbackAppendWriter {
  write(chunk: Uint8Array): Result<void, PtyError>
  close(): Result<void, PtyError>
}

/**
 * Minimal filesystem effect surface the file-based scrollback store needs. Real adapter wraps Bun's
 * FileSink + node:fs; the in-memory fake makes the store unit-testable with no disk.
 */
export interface ScrollbackFs {
  /** Open `path` for appending (creating it if absent), returning a writer. */
  openAppend(path: string): Result<ScrollbackAppendWriter, PtyError>
  /** Read the entire file at `path`. Missing file => scrollback-io err. */
  readWhole(path: string): Result<Uint8Array, PtyError>
  /** True when `path` exists. */
  exists(path: string): boolean
  /** Rename `from` to `to`, replacing any existing `to`. */
  rename(from: string, to: string): Result<void, PtyError>
  /** Remove `path`; removing a missing path is a no-op success. */
  unlink(path: string): Result<void, PtyError>
}

const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** In-memory `ScrollbackFs` fake: a path -> bytes map. Deterministic, disk-free. */
export const createMemoryScrollbackFs = (): ScrollbackFs => {
  const files = new Map<string, Uint8Array>()
  return {
    openAppend: (path): Result<ScrollbackAppendWriter, PtyError> => {
      if (!files.has(path)) files.set(path, new Uint8Array(0))
      return ok({
        write: (chunk): Result<void, PtyError> => {
          files.set(path, concatBytes(files.get(path) ?? new Uint8Array(0), chunk))
          return ok(undefined)
        },
        close: (): Result<void, PtyError> => ok(undefined),
      })
    },
    readWhole: (path): Result<Uint8Array, PtyError> => {
      const bytes = files.get(path)
      if (bytes === undefined)
        return err({ kind: "scrollback-io", detail: `no such file: ${path}` })
      return ok(bytes)
    },
    exists: (path): boolean => files.has(path),
    rename: (from, to): Result<void, PtyError> => {
      const bytes = files.get(from)
      if (bytes === undefined)
        return err({ kind: "scrollback-io", detail: `no such file: ${from}` })
      files.delete(from)
      files.set(to, bytes)
      return ok(undefined)
    },
    unlink: (path): Result<void, PtyError> => {
      files.delete(path)
      return ok(undefined)
    },
  }
}

export interface ScrollbackStore {
  append(id: SessionId, chunk: Uint8Array): Result<void, PtyError>
  read(id: SessionId): Result<Uint8Array, PtyError>
  close(id: SessionId): Result<void, PtyError>
}

const DEFAULT_CAP_BYTES = 1024 * 1024

/** Reject ids that are empty or could escape `dir` (separators / parent refs). */
const safeId = (id: SessionId): Result<string, PtyError> => {
  const s = String(id)
  if (s.length === 0 || s.includes("/") || s.includes("\\") || s.includes("..")) {
    return err({ kind: "scrollback-io", detail: `unsafe session id: ${s}` })
  }
  return ok(s)
}

export const createFileScrollbackStore = (deps: {
  dir: string
  fs: ScrollbackFs
  capBytes?: number
}): ScrollbackStore => {
  const capBytes = deps.capBytes ?? DEFAULT_CAP_BYTES
  // Per-session open append writer + the byte count written to the CURRENT <id>.bin (reset on rotate).
  const open = new Map<string, { writer: ScrollbackAppendWriter; bytes: number }>()

  const mainPath = (safe: string): string => `${deps.dir}/${safe}.bin`
  const rotatedPath = (safe: string): string => `${deps.dir}/${safe}.1.bin`

  const writerFor = (
    safe: string,
  ): Result<{ writer: ScrollbackAppendWriter; bytes: number }, PtyError> => {
    const existing = open.get(safe)
    if (existing !== undefined) return ok(existing)
    const opened = deps.fs.openAppend(mainPath(safe))
    if (!opened.ok) return opened
    const entry = { writer: opened.value, bytes: 0 }
    open.set(safe, entry)
    return ok(entry)
  }

  return {
    append: (id, chunk): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const entry = writerFor(safe.value)
      if (!entry.ok) return entry
      const written = entry.value.writer.write(chunk)
      if (!written.ok) return written
      entry.value.bytes += chunk.length
      if (entry.value.bytes >= capBytes) {
        const closed = entry.value.writer.close()
        if (!closed.ok) return closed
        open.delete(safe.value)
        // Replace any prior rotated generation, then rotate the current file into the .1 slot.
        if (deps.fs.exists(rotatedPath(safe.value))) {
          const removed = deps.fs.unlink(rotatedPath(safe.value))
          if (!removed.ok) return removed
        }
        const renamed = deps.fs.rename(mainPath(safe.value), rotatedPath(safe.value))
        if (!renamed.ok) return renamed
        // Next append re-opens a fresh <id>.bin via writerFor (map entry already deleted).
      }
      return ok(undefined)
    },

    read: (id): Result<Uint8Array, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const out: Uint8Array[] = []
      if (deps.fs.exists(rotatedPath(safe.value))) {
        const prev = deps.fs.readWhole(rotatedPath(safe.value))
        if (!prev.ok) return prev
        out.push(prev.value)
      }
      if (deps.fs.exists(mainPath(safe.value))) {
        const cur = deps.fs.readWhole(mainPath(safe.value))
        if (!cur.ok) return cur
        out.push(cur.value)
      }
      const total = out.reduce((n, b) => n + b.length, 0)
      const merged = new Uint8Array(total)
      let off = 0
      for (const b of out) {
        merged.set(b, off)
        off += b.length
      }
      return ok(merged)
    },

    close: (id): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const entry = open.get(safe.value)
      if (entry === undefined) return ok(undefined)
      open.delete(safe.value)
      return entry.writer.close()
    },
  }
}

/**
 * Real `ScrollbackFs`: Bun FileSink for appends, node:fs readFileSync for reads, node:fs for
 * rename/unlink/exists.
 *
 * Note: the contract names `Bun.file().arrayBuffer()` for reads, but that API is async and cannot
 * satisfy the synchronous `Result` interface. The real adapter uses `node:fs` `readFileSync` for the
 * whole-file read while keeping Bun's `FileSink` for the append path.
 */
export const createBunScrollbackFs = (): ScrollbackFs => ({
  openAppend: (path): Result<ScrollbackAppendWriter, PtyError> => {
    try {
      // FileSink in append mode keeps adding to the existing file rather than truncating it.
      const sink = Bun.file(path).writer()
      return ok({
        write: (chunk): Result<void, PtyError> => {
          try {
            sink.write(chunk)
            // flush() makes the bytes durable promptly so a concurrent read sees recent output.
            sink.flush()
            return ok(undefined)
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause)
            return err({ kind: "scrollback-io", detail })
          }
        },
        close: (): Result<void, PtyError> => {
          try {
            sink.end()
            return ok(undefined)
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause)
            return err({ kind: "scrollback-io", detail })
          }
        },
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  readWhole: (path): Result<Uint8Array, PtyError> => {
    try {
      const buf = readFileSync(path)
      return ok(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  exists: (path): boolean => existsSync(path),
  rename: (from, to): Result<void, PtyError> => {
    try {
      renameSync(from, to)
      return ok(undefined)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  unlink: (path): Result<void, PtyError> => {
    try {
      unlinkSync(path)
      return ok(undefined)
    } catch (cause) {
      if ((cause as { code?: string }).code === "ENOENT") return ok(undefined)
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
})

/** In-memory `ScrollbackStore` fake: per-session byte buffer, no disk. Durable until process exit. */
export const createMemoryScrollbackStore = (): ScrollbackStore => {
  const bufs = new Map<string, Uint8Array>()
  return {
    append: (id, chunk): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      bufs.set(safe.value, concatBytes(bufs.get(safe.value) ?? new Uint8Array(0), chunk))
      return ok(undefined)
    },
    read: (id): Result<Uint8Array, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      return ok(bufs.get(safe.value) ?? new Uint8Array(0))
    },
    close: (): Result<void, PtyError> => ok(undefined),
  }
}

export type { SessionId }
