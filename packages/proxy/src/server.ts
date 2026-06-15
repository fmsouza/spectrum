import { createNoopLogger } from "@spectrum/logger"
import { type HandlerDeps, createHandler } from "./handler"

export interface StartProxyOptions extends HandlerDeps {
  host: string
  port: number
}
export interface RunningProxy {
  hostname: string
  port: number
  stop(): void
}

export const startProxy = (opts: StartProxyOptions): RunningProxy => {
  // Lifecycle observer (default noop). SECURITY: only host/port are ever logged — NEVER the proxyKey.
  const logger = opts.logger ?? createNoopLogger()
  const handler = createHandler(opts)
  const server = Bun.serve({
    hostname: opts.host,
    port: opts.port,
    // Disable Bun's idle-connection timeout (default 10s). This is a STREAMING proxy: a slow model
    // can take far longer than 10s to emit its first token (large context + tools + thinking on a
    // cloud model), during which the socket is idle — Bun would close it, surfacing to the harness
    // as "The socket connection was closed unexpectedly". The harness and the upstream own their own
    // timeouts; on loopback there is no resource risk to leaving long-lived streams open.
    idleTimeout: 0,
    fetch: handler.fetch,
  })
  const hostname = server.hostname ?? opts.host
  const port = server.port ?? opts.port
  logger.info("proxy started", { host: hostname, port })
  return {
    hostname,
    port,
    stop: () => {
      server.stop(true)
      logger.info("proxy stopped")
    },
  }
}

export const isProxyRunning = async (
  baseUrl: string,
  timeoutMs = 300,
): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}
