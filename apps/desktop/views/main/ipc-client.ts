import { type ClientTransport, createIpcClient } from "@launchkit/ipc"

/** Re-export the webview's client type so pages/hooks import it from one place. */
export type { IpcClient } from "@launchkit/ipc"
export { createIpcClient }

/**
 * The Electrobun RPC surface this adapter calls. We only ever invoke `request`
 * (main->webview handlers return values); `send` (fire-and-forget) is unused here.
 * Exported so `clients.ts` can build the transport over the shared Electroview.
 */
export type ElectrobunRpc = {
  readonly request: Readonly<
    Record<string, (payload: unknown) => Promise<unknown>>
  >
}

/**
 * The single Electrobun-coupled file. Wraps `Electroview.rpc.request.<method>`
 * in the transport-agnostic `ClientTransport` interface so everything above it
 * (hooks, pages) is tested with a fake client and no Electrobun runtime.
 */
export const createElectrobunTransport = (
  rpc: ElectrobunRpc,
): ClientTransport => ({
  send: (method, payload) => {
    const call = rpc.request[method]
    if (call === undefined) {
      return Promise.reject(new Error(`unknown ipc method: ${method}`))
    }
    return call(payload)
  },
})
