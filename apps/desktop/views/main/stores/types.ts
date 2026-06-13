import type { IpcClient } from "@spectrum/ipc"

/** Dependencies every IPC-backed store receives from the factory. */
export type StoreDeps = {
  readonly client: IpcClient
}
