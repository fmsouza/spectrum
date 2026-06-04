import type { IpcClient } from "@launchkit/ipc"
import type { HarnessId, SessionId } from "@launchkit/types"
import { AppShell } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "./ErrorBoundary"
import { IpcClientProvider } from "./IpcClientContext"
import { createRealClients } from "./clients"
import {
  DashboardPage,
  HarnessesPage,
  ProvidersPage,
  RoutingPage,
  SessionsPage,
} from "./pages"
import { TerminalPage } from "./terminal/TerminalPage"
import type { CreateTerminal } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
import { useTerminals } from "./terminal/useTerminals"

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

export const App = ({
  client,
  initialView = "sessions",
  terminalClient,
  createTerminal,
}: AppProps): ReactElement => {
  const [view, setView] = useState<View>(parseView(initialView))

  const { tabs, openTab, closeTab } = useTerminals(terminalClient)
  const [labels, setLabels] = useState<
    Readonly<Partial<Record<SessionId, string>>>
  >({})

  // Keep the URL hash in sync so reloads land on the same view (no remote nav).
  useEffect(() => {
    window.location.hash = encodeView(view)
  }, [view])

  const onLaunched = (sessionId: SessionId, harnessId: HarnessId): void => {
    setLabels((prev) => ({ ...prev, [sessionId]: harnessId }))
    openTab(sessionId)
    setView({ kind: "sessions", selectedSessionId: sessionId })
  }

  // TEMPORARY (rewritten in D.11): map a settings section onto the existing
  // settings-ish pages and the sessions view onto the current terminal page so
  // the app stays green between the D.9/D.11/D.12 sub-steps.
  const renderSettings = (section: string): ReactElement => {
    switch (section) {
      case "providers":
        return <ProvidersPage />
      case "routing":
        return <RoutingPage />
      case "harnesses":
        return <HarnessesPage />
      case "sessions":
        return <SessionsPage />
      default:
        return <DashboardPage onLaunched={onLaunched} />
    }
  }

  const renderDetail = (): ReactElement =>
    view.kind === "settings" ? (
      renderSettings(view.section)
    ) : (
      <TerminalPage
        client={terminalClient}
        tabs={tabs}
        closeTab={closeTab}
        labels={labels}
        createTerminal={createTerminal}
      />
    )

  const mode = view.kind === "settings" ? "settings" : "sessions"

  return (
    <IpcClientProvider client={client}>
      <AppShell
        mode={mode}
        onModeChange={(next) =>
          setView(
            next === "settings"
              ? { kind: "settings", section: "general" }
              : { kind: "sessions" },
          )
        }
        proxyRunning={false}
        master={null}
        detail={
          <ErrorBoundary key={encodeView(view)}>{renderDetail()}</ErrorBoundary>
        }
      />
    </IpcClientProvider>
  )
}

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
