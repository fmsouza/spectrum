import { join } from "node:path"
import type { LogRecord, Sink } from "./types"

/** Minimal synchronous filesystem effect for the rotating log file. */
export interface LogFileOps {
  ensureDir(dir: string): void
  /** Byte size of the file, or 0 if it does not exist. */
  size(path: string): number
  append(path: string, text: string): void
  rename(from: string, to: string): void
  remove(path: string): void
  exists(path: string): boolean
}

/**
 * Rotating JSON-lines file sink. Appends `JSON.stringify(record)\n`; before each append,
 * if the current file is >= maxBytes it rotates (spectrum.log -> .1 -> … up to maxFiles,
 * dropping the oldest). All IO is best-effort — a fileOps throw is swallowed (logging never throws).
 */
export const createRotatingFileSink = (deps: {
  readonly fileOps: LogFileOps
  readonly dir: string
  readonly file?: string
  readonly maxBytes: number
  readonly maxFiles: number
}): Sink => {
  const name = deps.file ?? "spectrum.log"
  const pathOf = (n: number): string =>
    n === 0 ? join(deps.dir, name) : join(deps.dir, `${name}.${n}`)

  try {
    deps.fileOps.ensureDir(deps.dir)
  } catch {
    // best-effort
  }

  const rotate = (): void => {
    const oldest = pathOf(deps.maxFiles - 1)
    if (deps.fileOps.exists(oldest)) deps.fileOps.remove(oldest)
    for (let n = deps.maxFiles - 2; n >= 0; n--) {
      if (deps.fileOps.exists(pathOf(n)))
        deps.fileOps.rename(pathOf(n), pathOf(n + 1))
    }
  }

  return {
    write: (record: LogRecord): void => {
      try {
        const current = pathOf(0)
        if (deps.fileOps.size(current) >= deps.maxBytes) rotate()
        deps.fileOps.append(current, `${JSON.stringify(record)}\n`)
      } catch {
        // Logging must never throw.
      }
    },
  }
}

/** In-memory fake for tests. `readForTest` exposes accumulated contents. */
export const createInMemoryLogFileOps = (): LogFileOps & {
  readForTest(path: string): string
} => {
  const store = new Map<string, string>()
  return {
    ensureDir: () => {},
    size: (path) => Buffer.byteLength(store.get(path) ?? "", "utf8"),
    append: (path, text) => {
      store.set(path, (store.get(path) ?? "") + text)
    },
    rename: (from, to) => {
      const v = store.get(from)
      if (v !== undefined) {
        store.set(to, v)
        store.delete(from)
      }
    },
    remove: (path) => {
      store.delete(path)
    },
    exists: (path) => store.has(path),
    readForTest: (path) => store.get(path) ?? "",
  }
}
