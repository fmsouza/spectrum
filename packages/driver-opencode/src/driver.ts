import type { AgentDriver } from "@launchkit/agent-driver"
import { createDriver } from "@launchkit/driver-runtime"
import type { IdGen } from "@launchkit/utils"
import { createOpencodeAdapter } from "./adapter"
import type {
  OpencodeClient,
  OpencodeConnect,
  OpencodeConnectConfig,
  OpencodeEvent,
  OpencodeEventStream,
  OpencodeServer,
} from "./transport"

const DEFAULT_WATCHDOG_MS = 180_000

export interface OpencodeDriverDeps {
  /** Mints runner ids (rnr prefix). */
  readonly idGen: IdGen
  /**
   * Start/connect `opencode serve` + client. Defaults to the real connector built on @opencode-ai/sdk.
   * Tests inject a fake.
   */
  readonly connect?: OpencodeConnect
  /** #6573 watchdog timeout (ms). Defaults to 180_000; 0 disables. */
  readonly watchdogMs?: number
  /** Schedules the async adapter start; defaults to queueMicrotask (forwarded to createDriver). */
  readonly scheduler?: (fn: () => void) => void
}

/**
 * Build the OpenCode AgentDriver. Mirrors createClaudeDriver/createCodexDriver: wrap the per-harness
 * adapter with the shared runtime's createDriver. The connector is injected so the adapter logic is
 * unit-testable; the default starts a loopback `opencode serve` via @opencode-ai/sdk and is exercised by
 * the app-run smoke (Plan 3 Task 7).
 */
export const createOpencodeDriver = (deps: OpencodeDriverDeps): AgentDriver =>
  createDriver({
    adapter: createOpencodeAdapter({
      connect: deps.connect ?? realOpencodeConnect,
      watchdogMs: deps.watchdogMs ?? DEFAULT_WATCHDOG_MS,
    }),
    idGen: deps.idGen,
    ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
  })

/**
 * Adapt the broad SDK client to our reduced `OpencodeClient` port: unwrap `.data` from the hey-api
 * `RequestResult`, thread the working directory into each request's `query.directory`, route the
 * permission reply to the top-level `postSessionIdPermissionsPermissionId` method, and expose the global
 * SSE stream. The SDK→port casts are confined HERE (the adapter/mapper stay strict). `sdkClient` is the
 * `OpencodeClient` instance from `@opencode-ai/sdk`.
 */
const adaptClient = (
  sdkClient: {
    readonly session: {
      create(
        opts: unknown,
      ): Promise<{ readonly data?: { readonly id?: string } }>
      prompt(opts: unknown): Promise<unknown>
      abort(opts: unknown): Promise<unknown>
    }
    postSessionIdPermissionsPermissionId(opts: unknown): Promise<unknown>
    readonly event: {
      subscribe(
        opts?: unknown,
      ): Promise<{ readonly stream: AsyncIterable<unknown> }>
    }
  },
  directory: string,
): OpencodeClient => {
  const query = { directory }
  return {
    session: {
      create: async (args) => {
        const res = await sdkClient.session.create({ body: args.body, query })
        const id = res.data?.id
        if (id === undefined)
          throw new Error("opencode session.create returned no session id")
        return { id }
      },
      prompt: async (args) =>
        sdkClient.session.prompt({ path: args.path, body: args.body, query }),
      abort: async (args) =>
        sdkClient.session.abort({ path: args.path, query }),
      permissions: async (args) =>
        sdkClient.postSessionIdPermissionsPermissionId({
          path: args.path,
          body: args.body,
          query,
        }),
    },
    event: {
      subscribe: async (): Promise<OpencodeEventStream> => {
        // Scope the SSE stream to the session's directory. `opencode serve` is spawned with the APP's
        // cwd, not the project's, so an unscoped `/event` subscribes to the wrong project and receives
        // only `server.*` infra events — never this session's message/part/idle events.
        const sub = await sdkClient.event.subscribe({ query: { directory } })
        // The SDK's stream yields the raw Event objects; the mapper tolerates unknown types defensively.
        return { stream: sub.stream as AsyncIterable<OpencodeEvent> }
      },
    },
  }
}

/**
 * The real connector: lazily import @opencode-ai/sdk (fast CLI cold-start — never load it in tests), then
 * either start a loopback `opencode serve` (createOpencode) or attach to an explicit baseUrl
 * (createOpencodeClient). The returned client is adapted to the reduced OpencodeClient surface.
 */
const realOpencodeConnect: OpencodeConnect = async (
  config: OpencodeConnectConfig,
) => {
  const sdk = await import("@opencode-ai/sdk")
  if (config.baseUrl !== undefined) {
    const client = sdk.createOpencodeClient({
      baseUrl: config.baseUrl,
      directory: config.cwd,
    })
    return { client: adaptClient(client as never, config.cwd) }
  }
  // Pass the proxy provider config: the SDK serializes it into OPENCODE_CONFIG_CONTENT for the
  // spawned `opencode serve` (its only env channel — createOpencode takes no `env`). The cast to the
  // SDK's broad `ServerOptions` is the SDK-boundary seam (our typed subset → its `Config`), confined
  // here like adaptClient.
  const serverOptions = {
    hostname: "127.0.0.1",
    port: config.port ?? 0,
    ...(config.config !== undefined ? { config: config.config } : {}),
  }
  const { client, server } = await sdk.createOpencode(
    serverOptions as Parameters<typeof sdk.createOpencode>[0],
  )
  return {
    client: adaptClient(client as never, config.cwd),
    server: { url: server.url, close: () => server.close() } as OpencodeServer,
  }
}
