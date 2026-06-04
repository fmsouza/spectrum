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

const ROUTES = [
  "dashboard",
  "providers",
  "routing",
  "harnesses",
  "sessions",
  "terminal",
] as const
export type Route = (typeof ROUTES)[number]

const NAV_ITEMS = [
  { route: "dashboard", label: "Dashboard" },
  { route: "providers", label: "Providers" },
  { route: "routing", label: "Routing" },
  { route: "harnesses", label: "Harnesses" },
  { route: "sessions", label: "Sessions" },
  { route: "terminal", label: "Terminal" },
] as const

const isRoute = (value: string): value is Route =>
  (ROUTES as readonly string[]).includes(value)

const normalizeRoute = (value: string): Route =>
  isRoute(value) ? value : "dashboard"

export type AppProps = {
  readonly client: IpcClient
  readonly initialRoute?: string
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
  initialRoute = "dashboard",
  terminalClient,
  createTerminal,
}: AppProps): ReactElement => {
  const [route, setRoute] = useState<Route>(normalizeRoute(initialRoute))

  const { tabs, openTab, closeTab } = useTerminals(terminalClient)
  const [labels, setLabels] = useState<
    Readonly<Partial<Record<SessionId, string>>>
  >({})

  // Keep the URL hash in sync so reloads land on the same page (no remote nav).
  useEffect(() => {
    window.location.hash = `#${route}`
  }, [route])

  const onLaunched = (sessionId: SessionId, harnessId: HarnessId): void => {
    setLabels((prev) => ({ ...prev, [sessionId]: harnessId }))
    openTab(sessionId)
    setRoute("terminal")
  }

  const renderPage = (): ReactElement => {
    switch (route) {
      case "dashboard":
        return <DashboardPage onLaunched={onLaunched} />
      case "providers":
        return <ProvidersPage />
      case "routing":
        return <RoutingPage />
      case "harnesses":
        return <HarnessesPage />
      case "sessions":
        return <SessionsPage />
      case "terminal":
        return (
          <TerminalPage
            client={terminalClient}
            tabs={tabs}
            closeTab={closeTab}
            labels={labels}
            createTerminal={createTerminal}
          />
        )
      default: {
        const _exhaustive: never = route
        return _exhaustive
      }
    }
  }

  return (
    <IpcClientProvider client={client}>
      <AppShell
        mode="sessions"
        onModeChange={() => {}}
        proxyRunning={false}
        master={
          <nav aria-label="Primary">
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.route}>
                  <a
                    href={`#${item.route}`}
                    aria-current={item.route === route ? "page" : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      setRoute(normalizeRoute(item.route))
                    }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
        detail={<ErrorBoundary key={route}>{renderPage()}</ErrorBoundary>}
      />
    </IpcClientProvider>
  )
}

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = async (): Promise<void> => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startRoute = window.location.hash.replace(/^#/, "")
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
        initialRoute={startRoute}
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
