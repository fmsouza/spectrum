import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises"
import { dirname } from "node:path"
import { type Platform, detectPlatform } from "@launchkit/platform"
import { type Result, err, ok } from "@launchkit/utils"
import type { ConfigError } from "./errors"
import type { ConfigFile } from "./file"

const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * Production `ConfigFile` backed by `node:fs/promises`. Writes are atomic and `0600` on POSIX:
 * full contents → `<path>.tmp` → fsync → rename over `<path>` → chmod 0600. The parent dir
 * is created `0700` if missing. `read` returns the raw bytes — JSON parsing belongs to the store.
 * On Windows the POSIX `mode` bits and the final `chmod` are skipped; per-user privacy is
 * provided by the `%APPDATA%` ACL instead.
 */
export const createFsConfigFile = (
  path: string,
  platform: Platform = detectPlatform(),
): ConfigFile => {
  const isWindows = platform === "windows"
  return {
    read: async (): Promise<Result<string, ConfigError>> => {
      try {
        return ok(await readFile(path, "utf8"))
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT")
          return err({ kind: "not-found" })
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "parse-failed", detail })
      }
    },

    writeAtomic: async (
      contents: string,
    ): Promise<Result<void, ConfigError>> => {
      const tmp = `${path}.tmp`
      try {
        await mkdir(dirname(path), {
          recursive: true,
          ...(isWindows ? {} : { mode: DIR_MODE }),
        })
        await writeFile(tmp, contents, isWindows ? {} : { mode: FILE_MODE })

        // fsync the temp file so the bytes are durable before the rename swaps it in.
        const handle = await open(tmp, "r+")
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }

        await rename(tmp, path)
        if (!isWindows) await chmod(path, FILE_MODE)
        return ok(undefined)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "write-failed", detail })
      }
    },

    exists: async (): Promise<boolean> => {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
  }
}
