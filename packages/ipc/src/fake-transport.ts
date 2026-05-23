import type { ClientTransport } from "./client"
import type { ServerTransport } from "./server"

/** A linked client+server transport sharing one in-process channel. */
export interface MemoryTransportPair {
  readonly client: ClientTransport
  readonly server: ServerTransport
}

/**
 * Build a directly-wired transport pair for tests: the client's `send`
 * invokes the server's registered request handler in-process (no Electrobun,
 * no serialization). A handler throw rejects the client's `send`, which the
 * client helper maps to a `transport-failed` Result.
 */
export const createMemoryTransportPair = (): MemoryTransportPair => {
  let handler:
    | ((method: string, payload: unknown) => Promise<unknown>)
    | undefined

  const client: ClientTransport = {
    send: async (method, payload) => {
      if (!handler) throw new Error("transport-failed: no server registered")
      return handler(method, payload)
    },
  }

  const server: ServerTransport = {
    onRequest: (h) => {
      handler = h
    },
  }

  return { client, server }
}
