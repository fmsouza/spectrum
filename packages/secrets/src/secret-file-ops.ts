import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname } from "node:path"
import { type Platform, detectPlatform } from "@launchkit/platform"
import { type Result, err, ok } from "@launchkit/utils"
import type { SecretError } from "./backend"

/** Minimal filesystem effect for the encrypted-file backend. Atomic, `0600` on POSIX. */
export interface SecretFileOps {
  read(path: string): Promise<Result<string, SecretError>>
  write(path: string, contents: string): Promise<Result<void, SecretError>>
  remove(path: string): Promise<Result<void, SecretError>>
  exists(path: string): Promise<boolean>
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

export const createFsSecretFileOps = (
  platform: Platform = detectPlatform(),
): SecretFileOps => {
  const isWindows = platform === "windows"
  return {
    read: async (path) => {
      try {
        return ok(await readFile(path, "utf8"))
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT")
          return err({ kind: "not-found" })
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "backend-failed", detail })
      }
    },
    write: async (path, contents) => {
      const tmp = `${path}.tmp`
      try {
        await mkdir(dirname(path), {
          recursive: true,
          ...(isWindows ? {} : { mode: DIR_MODE }),
        })
        await writeFile(tmp, contents, isWindows ? {} : { mode: FILE_MODE })
        await rename(tmp, path)
        if (!isWindows) await chmod(path, FILE_MODE)
        return ok(undefined)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "backend-failed", detail })
      }
    },
    remove: async (path) => {
      try {
        await rm(path, { force: true })
        return ok(undefined)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "backend-failed", detail })
      }
    },
    exists: async (path) => {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
  }
}

/** Map-based fake for unit tests. */
export const createInMemorySecretFileOps = (): SecretFileOps => {
  const store = new Map<string, string>()
  return {
    read: async (path) =>
      store.has(path)
        ? ok(store.get(path) as string)
        : err({ kind: "not-found" }),
    write: async (path, contents) => {
      store.set(path, contents)
      return ok(undefined)
    },
    remove: async (path) => {
      store.delete(path)
      return ok(undefined)
    },
    exists: async (path) => store.has(path),
  }
}
