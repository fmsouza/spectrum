import {
  IpcMethodSchemas,
  type ServerTransport,
  createIpcServer,
} from "@launchkit/ipc"
import { type PtyOutbound, decodeInbound } from "@launchkit/pty"
import { isOk } from "@launchkit/utils"
import type { AppContext } from "../composition"
import { createIpcHandlers } from "./ipc/handlers"

/** The subset of BrowserWindow options this shell sets (security.md webview hardening). */
export interface WindowOptions {
  readonly url: string
  readonly title: string
  /** Lock navigation to the app origin; external links open in the system browser, not the webview. */
  readonly lockNavigationToOrigin: boolean
}

/**
 * The Electrobun seam, injected so the logic is testable without a real window. `createWindow`
 * opens the BrowserWindow; `makeTransport` builds a `ServerTransport` over the Electrobun message
 * bus for that window; `wireServer` registers the validated IPC handlers on it.
 */
/**
 * The terminal seam `createWindow` binds the Electrobun `messages` channel to: inbound webview
 * messages are routed to `handleInbound`; `bindSend` receives the outbound sink that pushes
 * `PtyOutbound` to the webview once the RPC exists.
 */
type WindowTerminal = Pick<AppContext["terminal"], "handleInbound" | "bindSend">

export interface OpenWindowDeps {
  readonly createWindow: (
    opts: WindowOptions,
    terminal: WindowTerminal,
  ) => unknown
  readonly makeTransport: (window: unknown) => ServerTransport
  readonly wireServer: (transport: ServerTransport, ctx: AppContext) => void
  readonly viewUrl: string
}

/** Default `wireServer`: bind the contract handlers to the transport (validated both directions). */
const defaultWireServer = (
  transport: ServerTransport,
  ctx: AppContext,
): void => {
  createIpcServer(createIpcHandlers(ctx), transport)
}

/**
 * Open the GUI window and wire the typed IPC server to it. Thin by design: all decision logic lives
 * in `createIpcHandlers` (tested in desktop-shell-02); this only assembles Electrobun pieces, so it
 * is smoke-tested. SECURITY: the window loads the local built `views/main` only and locks navigation
 * to the app origin — the webview gets no direct fs/network/secret access, only the validated IPC.
 */
export const openWindow = (
  ctx: AppContext,
  deps: OpenWindowDeps = realOpenWindowDeps,
): void => {
  const window = deps.createWindow(
    {
      url: deps.viewUrl,
      title: "LaunchKit",
      lockNavigationToOrigin: true,
    },
    ctx.terminal,
  )
  const transport = deps.makeTransport(window)
  deps.wireServer(transport, ctx)
}

/**
 * Decode one inbound webview `messages` payload and route it to the terminal. Pure and synchronous:
 * a valid `PtyInbound` is handed to `terminal.handleInbound`; a malformed payload is silently dropped
 * (no throw) — the webview cannot crash the bun side with a bad message. This is the unit-tested core
 * of the Electrobun `messages` seam wired in `realOpenWindowDeps`.
 */
export const routeInboundMessage = (
  raw: unknown,
  terminal: Pick<AppContext["terminal"], "handleInbound">,
): void => {
  const decoded = decodeInbound(raw)
  if (isOk(decoded)) terminal.handleInbound(decoded.value)
  // malformed → silently dropped (no throw)
}

/** The inbound IPC handler the webview's RPC requests are dispatched to (bound by `wireServer`). */
type ServerHandler = (method: string, payload: unknown) => Promise<unknown>

/**
 * The narrow slice of Electrobun's `defineElectrobunRPC` result we use on the bun side: `send(name,
 * payload)` is its fire-and-forget outbound-message channel to the webview (electrobun's
 * `dist/api/shared/rpc.ts`). `defineElectrobunRPC` is typed `unknown` in our local `.d.ts` (its real
 * source does not compile under our strict config), so we narrow it here at the seam — never `any`.
 */
interface ElectrobunRpc {
  readonly send: (name: string, payload: unknown) => void
}

/**
 * What `createWindow` hands to `makeTransport`: the late-binding hook for the IPC server handler.
 * The Electrobun RPC request handlers are fixed at `BrowserWindow` construction, but the project's
 * `ServerTransport.onRequest(handler)` is called afterwards (in `wireServer`) — so the RPC handlers
 * delegate to this mutable slot, which `makeTransport` fills. The webview only issues requests once
 * its view has loaded, by which point the handler is bound.
 */
interface WindowBundle {
  readonly bindHandler: (handler: ServerHandler) => void
}

/**
 * Production Electrobun wiring. The bun-side RPC exposes one request handler per IPC method name
 * (from `IpcMethodSchemas`); each delegates to the bound `ServerTransport` handler, which
 * `createIpcServer` validates both directions. The webview side (`views/main/ipc-client.ts`)
 * mirrors this with `Electroview.defineRPC`. SECURITY: navigation is locked to bundled, local
 * assets — the window only ever loads `views://main/*` (the strict CSP in `index.html` blocks
 * remote scripts/eval), so the webview gets no direct fs/network/secret access, only validated IPC.
 */
export const realOpenWindowDeps: OpenWindowDeps = {
  createWindow: (opts, terminal) => {
    let handler: ServerHandler | null = null

    // One delegating request handler per IPC method; routes to the bound server handler.
    const requests: Record<string, (payload: unknown) => Promise<unknown>> =
      Object.fromEntries(
        Object.keys(IpcMethodSchemas).map((method) => [
          method,
          (payload: unknown): Promise<unknown> =>
            handler === null
              ? Promise.reject(new Error("ipc server not ready"))
              : handler(method, payload),
        ]),
      )

    // Load Electrobun lazily — and only in the built binary. A top-level import would pull its
    // native FFI module into `bun test`; the tested paths use injected fake deps and never reach
    // here. The webview only issues requests after its view loads, by which point `bindHandler`
    // has run, so deferring window creation past this dynamic import is safe.
    void import("electrobun/bun").then(
      ({ BrowserWindow, defineElectrobunRPC }) => {
        const rpc = defineElectrobunRPC("bun", {
          maxRequestTime: 5000,
          handlers: {
            requests: {},
            // The webview sends every terminal message under the single `"pty"` message name
            // (`rpc.send("pty", <PtyInbound>)`); Electrobun's wildcard dispatch hands this bun-side
            // handler the raw `PtyInbound` payload, which `routeInboundMessage` zod-validates+routes.
            messages: {
              pty: (payload: unknown): void =>
                routeInboundMessage(payload, terminal),
            },
          },
          extraRequestHandlers: requests,
        })
        new BrowserWindow({
          title: opts.title,
          url: opts.url,
          frame: { width: 1024, height: 720, x: 100, y: 100 },
          rpc,
        })
        // Now the RPC exists: push outbound pty bytes/exit to the webview under the same `"pty"`
        // message name. `rpc.send(name, payload)` is Electrobun's fire-and-forget outbound channel
        // (the webview listens for `"pty"` messages). Replaces the no-op sink set in composition.
        const send = (rpc as ElectrobunRpc).send
        terminal.bindSend((message: PtyOutbound) => {
          send("pty", message)
        })
      },
    )

    const bundle: WindowBundle = {
      bindHandler: (h) => {
        handler = h
      },
    }
    return bundle
  },
  makeTransport: (window) => ({
    onRequest: (h) => {
      ;(window as WindowBundle).bindHandler(h)
    },
  }),
  wireServer: defaultWireServer,
  viewUrl: "views://main/index.html",
}
