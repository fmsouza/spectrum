import type { IpcClient } from "@launchkit/ipc"
import type { SessionId } from "@launchkit/types"
import { type AppMode, AppShell } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { IpcClientProvider } from "./IpcClientContext"
import { createRealClients } from "./clients"
import { useProxyStatus } from "./hooks/useProxyStatus"
import type { CreateTerminal } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
import { SessionsView } from "./views/SessionsView"
import { SettingsView } from "./views/SettingsView"

/**
 * The top-level app view. `sessions` carries the optionally-selected session id;
 * `settings` carries the active section key. Serialized to the URL hash so a
 * reload lands on the same place (no remote navigation).
 */
export type View =
  | { readonly kind: "sessions"; readonly selectedSessionId?: SessionId }
  | { readonly kind: "settings"; readonly section: string }

/** Parse a raw hash (e.g. `#settings/providers`) into a `View`. */
const parseView = (raw: string): View => {
  const [kind, rest] = raw.replace(/^#/, "").split("/", 2)
  if (kind === "settings")
    return { kind: "settings", section: rest ?? "general" }
  if (kind === "sessions")
    return rest === undefined || rest === ""
      ? { kind: "sessions" }
      : { kind: "sessions", selectedSessionId: rest as SessionId }
  // Anything else (incl. the retired #dashboard) collapses to the default sessions view.
  return { kind: "sessions" }
}

/** Encode a `View` back to its hash representation. */
const encodeView = (view: View): string =>
  view.kind === "settings"
    ? `#settings/${view.section}`
    : view.selectedSessionId === undefined
      ? "#sessions"
      : `#sessions/${view.selectedSessionId}`

export type AppProps = {
  readonly client: IpcClient
  /** The initial view, as a raw hash string (e.g. `settings/providers`). */
  readonly initialView?: string
  /**
   * The terminal transport client. Injected so tests run without an Electroview;
   * production builds the real one via `createRealClients` in `clients.ts`.
   */
  readonly terminalClient: TerminalClient
  /**
   * The xterm factory for terminal panes. Injected from `mount()` in production
   * (the real `createXterm`); tests pass a fake so xterm + its CSS never load.
   */
  readonly createTerminal: CreateTerminal
}

/** Props for the data-aware inner shell (rendered inside `IpcClientProvider`). */
type AppInnerProps = {
  readonly initialView: string
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}

/**
 * The stateful app body. Split out from `App` so its IPC hooks (e.g.
 * `useProxyStatus`) and the view factories' hooks all run INSIDE the
 * `IpcClientProvider` that `App` mounts.
 */
const AppInner = ({
  initialView,
  terminalClient,
  createTerminal,
}: AppInnerProps): ReactElement => {
  const [view, setView] = useState<View>(parseView(initialView))
  // Open live sessions stay mounted (hidden) keyed by id so xterm scrollback
  // survives selection changes; never auto-removed (the old tab behaviour). The
  // launch flow that populates this set is wired in D.12.
  const [openSessionIds] = useState<readonly SessionId[]>([])
  const proxy = useProxyStatus()

  // Keep the URL hash in sync so reloads land on the same view (no remote nav).
  useEffect(() => {
    window.location.hash = encodeView(view)
  }, [view])

  const mode: AppMode = view.kind === "settings" ? "settings" : "sessions"

  const onModeChange = (next: AppMode): void =>
    setView(
      next === "settings"
        ? { kind: "settings", section: "general" }
        : { kind: "sessions" },
    )

  const { master, detail } =
    view.kind === "settings"
      ? SettingsView({
          section: view.section,
          onSection: (key) => setView({ kind: "settings", section: key }),
        })
      : SessionsView({
          ...(view.selectedSessionId === undefined
            ? {}
            : { selectedSessionId: view.selectedSessionId }),
          openSessionIds,
          onSelect: (id) =>
            setView({ kind: "sessions", selectedSessionId: id }),
          // The new-session modal is wired in D.12; a no-op is fine here.
          onNew: () => {},
          terminalClient,
          createTerminal,
        })

  return (
    <AppShell
      mode={mode}
      onModeChange={onModeChange}
      proxyRunning={proxy.data?.running ?? false}
      master={master}
      detail={detail}
    />
  )
}

export const App = ({
  client,
  initialView = "sessions",
  terminalClient,
  createTerminal,
}: AppProps): ReactElement => (
  <IpcClientProvider client={client}>
    <AppInner
      initialView={initialView}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
    />
  </IpcClientProvider>
)

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = async (): Promise<void> => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startView = window.location.hash.replace(/^#/, "")
  // Dynamic import keeps xterm (and its CSS) out of the test module graph: the
  // test runner imports `App` directly and never calls `mount`.
  const { createXterm } = await import("./terminal/createXterm")
  // Build the ONE shared Electroview (carries IPC requests + the terminal pty
  // channel) and get both clients from it. See `clients.ts`.
  const { ipcClient, terminalClient } = await createRealClients()
  createRoot(container).render(
    <StrictMode>
      <App
        client={ipcClient}
        terminalClient={terminalClient}
        createTerminal={createXterm}
        initialView={startView}
      />
    </StrictMode>,
  )
}

// Auto-mount only in the real webview (a DOM with #root), never under the test
// runner (which imports `App` directly and renders it with a fake client).
if (
  typeof document !== "undefined" &&
  document.getElementById("root") !== null
) {
  void mount()
}
