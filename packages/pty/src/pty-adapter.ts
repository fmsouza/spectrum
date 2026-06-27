import type { Result } from "@spectrum/utils"
import type { TerminalError } from "./errors"

export interface SpawnInput {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
  readonly cols: number
  readonly rows: number
}

export interface PtyHandle {
  onData(cb: (bytes: Uint8Array) => void): void
  onExit(cb: (exitCode: number) => void): void
  write(bytes: Uint8Array): void
  resize(cols: number, rows: number): void
  kill(): void
}

export interface PtySpawner {
  spawn(input: SpawnInput): Result<PtyHandle, TerminalError>
}

/** Lazy import of the native addon — isolated so a load failure is a `spawn-failed` Result, not a crash. */
export const createNodePtySpawner = (): PtySpawner => {
  return {
    spawn(input) {
      try {
        // Lazy require so a missing/broken native addon never breaks app boot.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePty = require("node-pty") as typeof import("node-pty")
        const proc = nodePty.spawn(input.command, [...input.args], {
          cwd: input.cwd,
          env: input.env,
          cols: input.cols,
          rows: input.rows,
        })
        const handle: PtyHandle = {
          onData(cb) {
            proc.onData((d: string) => cb(new TextEncoder().encode(d)))
          },
          onExit(cb) {
            proc.onExit((e: { exitCode: number }) => cb(e.exitCode))
          },
          write(bytes) {
            proc.write(new TextDecoder().decode(bytes))
          },
          resize(cols, rows) {
            proc.resize(cols, rows)
          },
          kill() {
            proc.kill()
          },
        }
        return { ok: true, value: handle }
      } catch (err) {
        return {
          ok: false,
          error: {
            kind: "spawn-failed",
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
  }
}
