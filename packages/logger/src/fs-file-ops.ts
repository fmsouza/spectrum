import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import type { LogFileOps } from "./file-sink"

/** Real synchronous filesystem-backed LogFileOps. The only effectful module in this package. */
export const createFsLogFileOps = (): LogFileOps => ({
  ensureDir: (dir) => {
    mkdirSync(dir, { recursive: true })
  },
  size: (path) => {
    try {
      return statSync(path).size
    } catch {
      return 0
    }
  },
  append: (path, text) => {
    appendFileSync(path, text)
  },
  rename: (from, to) => {
    renameSync(from, to)
  },
  remove: (path) => {
    rmSync(path, { force: true })
  },
  exists: (path) => existsSync(path),
})
