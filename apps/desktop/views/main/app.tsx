import type { IpcClient } from "@launchkit/ipc"
import { AppShell } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { IpcClientProvider } from "./IpcClientContext"
import { createRealIpcClient } from "./ipc-client"
import {
  DashboardPage,
  HarnessesPage,
  ProvidersPage,
  RoutingPage,
  SessionsPage,
} from "./pages"

const ROUTES = [
  "dashboard",
  "providers",
  "routing",
  "harnesses",
  "sessions",
] as const
export type Route = (typeof ROUTES)[number]

const NAV_ITEMS = [
  { route: "dashboard", label: "Dashboard" },
  { route: "providers", label: "Providers" },
  { route: "routing", label: "Routing" },
  { route: "harnesses", label: "Harnesses" },
  { route: "sessions", label: "Sessions" },
] as const

const isRoute = (value: string): value is Route =>
  (ROUTES as readonly string[]).includes(value)

const normalizeRoute = (value: string): Route =>
  isRoute(value) ? value : "dashboard"

const PAGES: Readonly<Record<Route, () => ReactElement>> = {
  dashboard: DashboardPage,
  providers: ProvidersPage,
  routing: RoutingPage,
  harnesses: HarnessesPage,
  sessions: SessionsPage,
}

export type AppProps = {
  readonly client: IpcClient
  readonly initialRoute?: string
}

export const App = ({
  client,
  initialRoute = "dashboard",
}: AppProps): ReactElement => {
  const [route, setRoute] = useState<Route>(normalizeRoute(initialRoute))

  // Keep the URL hash in sync so reloads land on the same page (no remote nav).
  useEffect(() => {
    window.location.hash = `#${route}`
  }, [route])

  const Page = PAGES[route]

  return (
    <IpcClientProvider client={client}>
      <AppShell
        navItems={NAV_ITEMS}
        activeRoute={route}
        onNavigate={(next) => setRoute(normalizeRoute(next))}
      >
        <Page />
      </AppShell>
    </IpcClientProvider>
  )
}

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = (): void => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startRoute = window.location.hash.replace(/^#/, "")
  createRoot(container).render(
    <StrictMode>
      <App client={createRealIpcClient()} initialRoute={startRoute} />
    </StrictMode>,
  )
}

// Auto-mount only in the real webview (a DOM with #root), never under the test
// runner (which imports `App` directly and renders it with a fake client).
if (
  typeof document !== "undefined" &&
  document.getElementById("root") !== null
) {
  mount()
}
