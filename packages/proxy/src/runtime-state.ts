import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises"
import { dirname } from "node:path"
import { type Result, err, ok } from "@spectrum/utils"

const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * Holds the per-run proxy key for an already-running proxy so a separate process (the CLI)
 * can reuse it instead of minting a mismatched one. The key is a short-lived per-run token,
 * NOT a long-lived secret — it never holds a provider secret or keychain ref.
 */
export interface RuntimeState {
  readProxyKey(): Promise<string | null>
  writeProxyKey(
    key: string,
  ): Promise<Result<void, { kind: "io-failed"; detail: string }>>
  clear(): Promise<void>
}

/** In-memory `RuntimeState` for tests — no filesystem touched. */
export const createInMemoryRuntimeState = (): RuntimeState => {
  let key: string | null = null
  return {
    readProxyKey: async (): Promise<string | null> => key,
    writeProxyKey: async (
      k: string,
    ): Promise<Result<void, { kind: "io-failed"; detail: string }>> => {
      key = k
      return ok(undefined)
    },
    clear: async (): Promise<void> => {
      key = null
    },
  }
}

/**
 * Production `RuntimeState` backed by a single JSON file (`{ proxyKey }`). Writes are atomic and
 * `0600` (tmp → fsync → rename → chmod), mirroring `@spectrum/config`'s `fs-config-file`. Reads
 * tolerate a missing/malformed file by returning `null`; `clear` is ENOENT-safe and never throws.
 */
export const createFileRuntimeState = (path: string): RuntimeState => ({
  readProxyKey: async (): Promise<string | null> => {
    try {
      const raw = await readFile(path, "utf8")
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "proxyKey" in parsed &&
        typeof (parsed as { proxyKey: unknown }).proxyKey === "string"
      ) {
        return (parsed as { proxyKey: string }).proxyKey
      }
      return null
    } catch {
      return null
    }
  },

  writeProxyKey: async (
    key: string,
  ): Promise<Result<void, { kind: "io-failed"; detail: string }>> => {
    const tmp = `${path}.tmp`
    try {
      await mkdir(dirname(path), { recursive: true, mode: DIR_MODE })
      await writeFile(tmp, JSON.stringify({ proxyKey: key }), {
        mode: FILE_MODE,
      })

      // fsync the temp file so the bytes are durable before the rename swaps it in.
      const handle = await open(tmp, "r+")
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }

      await rename(tmp, path)
      await chmod(path, FILE_MODE)
      return ok(undefined)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "io-failed", detail })
    }
  },

  clear: async (): Promise<void> => {
    try {
      await unlink(path)
    } catch {
      // ENOENT (or any other failure to remove a non-existent file) is a no-op.
    }
  },
})
