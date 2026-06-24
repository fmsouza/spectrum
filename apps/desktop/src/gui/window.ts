import {
  IpcMethodSchemas,
  type ServerTransport,
  createIpcServer,
} from "@spectrum/ipc"
import { detectPlatform } from "@spectrum/platform"
import type { AppContext } from "../composition"
import { createIpcHandlers } from "./ipc/handlers"
import type { WindowBounds } from "./window-bounds"
import { type WindowBoundsIO, createWindowBoundsIO } from "./window-bounds-io"

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

/** Internal: forward Electrobun resize/move events to the debounced bounds sink. */
const bindBoundsEvents = (
  window: {
    on(name: string, handler: (event: unknown) => void): void
    getFrame(): WindowBounds
  },
  onBoundsChange: (bounds: WindowBounds) => void,
): void => {
  window.on("resize", () => onBoundsChange(window.getFrame()))
  window.on("move", () => onBoundsChange(window.getFrame()))
}

/** The subset of BrowserWindow options this shell sets (security.md webview hardening). */
export interface WindowOptions {
  readonly url: string
  readonly title: string
  /** Resolve the initial frame from persisted (sanity-checked) bounds, or the default. */
  readonly loadInitialFrame: () => Promise<WindowBounds>
  /** Record a new window geometry on resize/move (debounced + persisted downstream). */
  readonly onBoundsChange: (bounds: WindowBounds) => void
  /**
   * Called once the native webview exists, handed a fn that reloads the SPA. The bun
   * side uses this to recover from a dead WKWebView content process (Electrobun 1.18.1
   * emits no termination event), since `loadURL` respawns the content process.
   */
  readonly onWebviewReady?: (reload: () => void) => void
}

/**
 * True for a genuinely external (web) navigation target we want to hand to the
 * OS browser. Deliberately strict: ONLY `http(s)://`. This excludes the app's
 * own `views://` origin (the SPA's startup/internal navigations, which must
 * stay in-window) and any non-string/garbage detail (a non-string here once
 * crashed the bun worker via `Utils.openExternal(undefined)` →
 * `toCString(undefined)`). Custom schemes (mailto:, slack://) are NOT opened on
 * this native path — they remain supported on the explicit React click → IPC
 * `openExternalUrl` path, which validates and forwards them.
 */
const isExternalWebUrl = (url: unknown): url is string =>
  typeof url === "string" &&
  (url.startsWith("https://") || url.startsWith("http://"))

/**
 * Subscribe to the window's webview `will-navigate` event and open genuinely
 * external (`http(s)`) navigation targets in the OS browser via `openExternal`.
 * Pure over the injected window + opener; the real `createWindow` wires it with
 * the live `BrowserView` + `Utils.openExternal`.
 *
 * `window.webview` is the Electrobun `BrowserView`. Its `on("will-navigate")`
 * delivers an `ElectrobunEvent` whose URL is at `event.data.detail` (see
 * `electrobun/dist/api/bun/events/webviewEvents.ts` — `willNavigate` builds the
 * event from `{ detail }`). We open that url externally as a best-effort
 * convenience, but ONLY when it is an external web URL: CEF on Linux fires
 * `will-navigate` for the SPA's own `views://` startup load, which must NOT be
 * routed to the browser (and reading the wrong field / an undefined url
 * previously crashed the process — see {@link isExternalWebUrl}).
 *
 * IMPORTANT — best-effort only, NOT a navigation lock. In Electrobun 1.18.1
 * `will-navigate` is purely observational: it is a plain event subscription
 * whose handler return value is discarded (see
 * `electrobun/dist/api/bun/core/BrowserView.ts` `on(...)`), so it CANNOT
 * cancel the in-window load. Real origin-locking is done natively via
 * `BrowserView.setNavigationRules(...)`, which this app does not yet set. The
 * primary external-link guarantee is the React click path (`MessageBubble`
 * calls `e.preventDefault()` then routes to the `openExternalUrl` IPC); this
 * handler only catches the non-click paths React can't see, and opens them
 * externally without preventing the (rare) in-window navigation. A real
 * origin-lock would set `BrowserView.setNavigationRules(...)` to deny non-`views://`
 * navigation natively (its rule grammar is undocumented in the installed
 * Electrobun and needs confirming before use) — left as a follow-up.
 */
export const bindExternalNavigation = (
  win: {
    readonly webview: {
      on(
        name: "will-navigate",
        handler: (event: {
          readonly data?: { readonly detail?: unknown }
        }) => void,
      ): void
    }
  },
  openExternal: (url: string) => boolean,
): void => {
  win.webview.on("will-navigate", (event) => {
    const url = event.data?.detail
    if (isExternalWebUrl(url)) openExternal(url)
  })
}

/**
 * Hand the caller a fn that reloads the SPA by re-navigating the webview to its
 * own `views://` entry. Pure over the injected window so it is testable without a
 * real BrowserView. The real `createWindow` wires it with the live webview; the
 * reload respawns a terminated WKWebView content process (the blank-after-sleep fix).
 */
export const bindWebviewReload = (
  win: { readonly webview: { loadURL(url: string): void } },
  viewUrl: string,
  onReady: (reload: () => void) => void,
): void => {
  onReady(() => win.webview.loadURL(viewUrl))
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
  /** Build the bounds restore/persist seam from the live context (config + logger). */
  readonly createBoundsIO: (ctx: AppContext) => WindowBoundsIO
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
 * is smoke-tested. SECURITY: the window loads the local built `views/main` only (the strict CSP in
 * `index.html` blocks remote scripts/eval), so the webview gets no direct fs/network/secret access,
 * only the validated IPC. `bindExternalNavigation` additionally opens external `http(s)` in-webview
 * navigation in the OS browser (best-effort — it does NOT prevent in-window navigation; see its doc
 * comment).
 */
export const openWindow = (
  ctx: AppContext,
  deps: OpenWindowDeps = realOpenWindowDeps,
): void => {
  const io = deps.createBoundsIO(ctx)
  // Task 4 wires onWebviewReady → ctx.rendererWatchdog.bindReload
  const window = deps.createWindow({
    url: deps.viewUrl,
    title: "Spectrum",
    loadInitialFrame: io.loadInitialFrame,
    onBoundsChange: io.onBoundsChange,
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
 * mirrors this with `Electroview.defineRPC`. SECURITY: the window only ever loads `views://main/*`
 * (the strict CSP in `index.html` blocks remote scripts/eval), so the webview gets no direct
 * fs/network/secret access, only validated IPC. `bindExternalNavigation` opens external `http(s)`
 * in-webview navigation in the OS browser as a best-effort convenience (it does NOT prevent the
 * in-window load — see `bindExternalNavigation`'s doc comment).
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
      async ({ BrowserWindow, defineElectrobunRPC, Utils }) => {
        // Electrobun carries only the IPC requests now. The canonical run-event stream runs over a
        // dedicated loopback WebSocket (see runner-socket.ts), so there is no `messages` channel or
        // outbound bind here anymore.
        const rpc = defineElectrobunRPC("bun", {
          maxRequestTime: 5000,
          handlers: { requests: {}, messages: {} },
          extraRequestHandlers: requests,
        })
        // Restore the last-known geometry (sanity-checked upstream); falls back to
        // the default frame on first run or when persisted bounds fail the guard.
        const frame = await opts.loadInitialFrame()
        const win = new BrowserWindow({
          title: opts.title,
          url: opts.url,
          frame,
          renderer: RENDERER,
          rpc,
        })
        // Track OS focus so background runs (window unfocused) fire a native notification.
        bindFocusEvents(win)
        // Persist size/position as the user resizes/moves the window.
        bindBoundsEvents(win, opts.onBoundsChange)
        // Best-effort: open EXTERNAL http(s) in-webview navigation (right-click
        // "Open Link", dragged URL, programmatic location.href) in the OS browser
        // via Utils.openExternal. bindExternalNavigation filters to external web
        // URLs only, so the SPA's own views:// startup load stays in-window (CEF on
        // Linux fires will-navigate for it). NOTE: will-navigate is observational in
        // Electrobun 1.18.1 — this does NOT prevent the in-window load (see
        // bindExternalNavigation's doc comment). The primary external-link path is
        // MessageBubble's preventDefault + openExternalUrl IPC; this only catches
        // the paths React can't see. `Utils` is already in scope from the outer
        // import, so no second dynamic import is needed.
        bindExternalNavigation(win, (url) => Utils.openExternal(url))
        // Hand the bun-side renderer watchdog a reload fn so it can respawn a dead
        // WKWebView content process (Electrobun emits no termination event).
        bindWebviewReload(win, opts.url, (reload) =>
          opts.onWebviewReady?.(reload),
        )
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
  createBoundsIO: (ctx) =>
    createWindowBoundsIO({ config: ctx.config, log: ctx.log }),
  viewUrl: "views://main/index.html",
}
