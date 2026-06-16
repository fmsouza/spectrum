import {
  IpcMethodSchemas,
  type ServerTransport,
  createIpcServer,
} from "@spectrum/ipc"
import { detectPlatform } from "@spectrum/platform"
import type { AppContext } from "../composition"
import { createIpcHandlers } from "./ipc/handlers"

// Linux must use CEF (GTK/WebKit can't handle Electrobun's webview layering); native elsewhere.
const RENDERER: "cef" | "native" =
  detectPlatform() === "linux" ? "cef" : "native"

/**
 * Window focus seam. A `let focused` flag, flipped by the Electrobun BrowserWindow `focus`/`blur`
 * events (bound in `realOpenWindowDeps.createWindow`), read synchronously by composition through
 * `isWindowFocused`. The notification service uses it to suppress native notifications while the
 * window is focused (the in-app toast covers that case).
 *
 * Default `true` (assume focused at launch). The native window emits `focus` on activation and
 * `blur` when it loses key status, so the flag tracks the real OS focus state once the window opens.
 */
let focused = true

/** Synchronous read of the current window focus flag (see {@link focused}). */
export const isWindowFocused = (): boolean => focused

/** Internal: bind the Electrobun focus/blur events of a constructed BrowserWindow to the flag. */
const bindFocusEvents = (window: {
  on(name: string, handler: (event: unknown) => void): void
}): void => {
  window.on("focus", () => {
    focused = true
  })
  window.on("blur", () => {
    focused = false
  })
}

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
 * bus for that window; `wireServer` registers the validated IPC handlers on it. (The canonical
 * run-event stream runs over a separate loopback WebSocket — see runner-socket.ts — not this
 * Electrobun seam.)
 */
export interface OpenWindowDeps {
  readonly createWindow: (opts: WindowOptions) => unknown
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
  const window = deps.createWindow({
    url: deps.viewUrl,
    title: "Spectrum",
    lockNavigationToOrigin: true,
  })
  const transport = deps.makeTransport(window)
  deps.wireServer(transport, ctx)
}

/** The inbound IPC handler the webview's RPC requests are dispatched to (bound by `wireServer`). */
type ServerHandler = (method: string, payload: unknown) => Promise<unknown>

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
  createWindow: (opts) => {
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
        // Electrobun carries only the IPC requests now. The canonical run-event stream runs over a
        // dedicated loopback WebSocket (see runner-socket.ts), so there is no `messages` channel or
        // outbound bind here anymore.
        const rpc = defineElectrobunRPC("bun", {
          maxRequestTime: 5000,
          handlers: { requests: {}, messages: {} },
          extraRequestHandlers: requests,
        })
        const win = new BrowserWindow({
          title: opts.title,
          url: opts.url,
          frame: { width: 1024, height: 720, x: 100, y: 100 },
          renderer: RENDERER,
          rpc,
        })
        // Track OS focus so background runs (window unfocused) fire a native notification.
        bindFocusEvents(win)
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
