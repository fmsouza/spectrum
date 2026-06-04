import type { SessionId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"

export type PtyError =
  | { readonly kind: "open-failed"; readonly detail: string }
  | { readonly kind: "not-found"; readonly id: SessionId }
  | { readonly kind: "scrollback-io"; readonly detail: string }

export interface PtyHandle {
  write(data: Uint8Array): void
  resize(cols: number, rows: number): void
  onData(cb: (chunk: Uint8Array) => void): void
  onExit(cb: (code: number) => void): void
  kill(): void
}

export interface PtyOpenOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
}

export interface PtyAdapter {
  open(opts: PtyOpenOptions): Result<PtyHandle, PtyError>
}

export interface FakePty extends PtyHandle {
  readonly writes: readonly Uint8Array[]
  readonly resizes: readonly { cols: number; rows: number }[]
  emit(text: string): void
  triggerExit(code: number): void
}

export const createFakePty = (): FakePty => {
  const writes: Uint8Array[] = []
  const resizes: { cols: number; rows: number }[] = []
  let dataCb: ((c: Uint8Array) => void) | null = null
  let exitCb: ((code: number) => void) | null = null
  return {
    writes,
    resizes,
    write: (d) => {
      writes.push(d)
    },
    resize: (cols, rows) => {
      resizes.push({ cols, rows })
    },
    onData: (cb) => {
      dataCb = cb
    },
    onExit: (cb) => {
      exitCb = cb
    },
    kill: () => {
      exitCb?.(0)
    },
    emit: (text) => dataCb?.(new TextEncoder().encode(text)),
    triggerExit: (code) => exitCb?.(code),
  }
}
