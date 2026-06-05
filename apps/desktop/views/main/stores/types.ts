import type { IpcClient } from "@launchkit/ipc"

/** Dependencies every IPC-backed store receives from the factory. */
export type StoreDeps = {
  readonly client: IpcClient
}
