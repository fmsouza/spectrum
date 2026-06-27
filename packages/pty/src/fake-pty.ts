import type { Result } from "@spectrum/utils"
import type { TerminalError } from "./errors"
import type { PtyHandle, PtySpawner, SpawnInput } from "./pty-adapter"

export interface FakePtyHandle extends PtyHandle {
  readonly _resizeCalls: ReadonlyArray<{ cols: number; rows: number }>
}

export interface FakePtySpawner extends PtySpawner {
  readonly calls: ReadonlyArray<SpawnInput>
}

export const createFakePtySpawner = (): FakePtySpawner => {
  const calls: SpawnInput[] = []
  return {
    get calls() {
      return calls
    },
    spawn(input) {
      calls.push(input)
      const resizeCalls: { cols: number; rows: number }[] = []
      const dataCbs: Array<(bytes: Uint8Array) => void> = []
      const exitCbs: Array<(exitCode: number) => void> = []
      let killed = false
      const handle: FakePtyHandle = {
        get _resizeCalls() {
          return resizeCalls
        },
        onData(cb) {
          dataCbs.push(cb)
        },
        onExit(cb) {
          exitCbs.push(cb)
        },
        write(_bytes) {
          // canned response: echo a prompt-ish line so tests can assert output flowed
          for (const cb of dataCbs) cb(new TextEncoder().encode("$ \r"))
        },
        resize(cols, rows) {
          resizeCalls.push({ cols, rows })
        },
        kill() {
          if (killed) return
          killed = true
          for (const cb of exitCbs) cb(0)
        },
      }
      const ok: Result<PtyHandle, TerminalError> = { ok: true, value: handle }
      return ok
    },
  }
}
