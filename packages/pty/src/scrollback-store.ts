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

// (createFileScrollbackStore / createMemoryScrollbackStore / createBunScrollbackFs land in PH.3–PH.6.)
export type { SessionId }
