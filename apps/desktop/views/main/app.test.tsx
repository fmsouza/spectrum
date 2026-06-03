import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { App } from "./app"
import type { XtermInstance } from "./terminal/TerminalPane"
import { createTerminalClient } from "./terminal/terminalClient"
import { createFakeIpcClient } from "./test/fake-client"

// A terminal client over a no-op transport so App mounts without an Electroview.
const fakeTerminalClient = () => createTerminalClient(() => {})

// A no-op xterm stand-in so terminal panes mount without real xterm under happy-dom.
const fakeTerminal = (): XtermInstance => ({
  open: () => {},
  write: () => {},
  onData: () => {},
  fit: () => {},
  cols: 80,
  rows: 24,
  dispose: () => {},
})

const fullClient = () =>
  createFakeIpcClient({
    getProviders: async () => ({ ok: true, value: [] }),
    getAliases: async () => ({ ok: true, value: [] }),
    getHarnesses: async () => ({ ok: true, value: [] }),
    getSessions: async () => ({ ok: true, value: [] }),
    getProxyStatus: async () => ({
      ok: true,
      value: { running: false, port: 0 },
    }),
  })

const renderApp = (initialRoute: string) =>
  render(
    <App
      client={fullClient()}
      terminalClient={fakeTerminalClient()}
      createTerminal={fakeTerminal}
      initialRoute={initialRoute}
    />,
  )

describe("App", () => {
  it("renders the dashboard route by default", async () => {
    renderApp("dashboard")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument(),
    )
  })

  it("navigates to the providers page when its nav item is clicked", async () => {
    renderApp("dashboard")
    fireEvent.click(screen.getByRole("link", { name: "Providers" }))
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Providers" }),
      ).toBeInTheDocument(),
    )
  })

  it("renders the routing page when the initial route is routing", async () => {
    renderApp("routing")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Routing" }),
      ).toBeInTheDocument(),
    )
  })

  it("falls back to the dashboard when given an unknown initial route", async () => {
    renderApp("bogus")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument(),
    )
  })

  it("renders the terminal page (empty state) on the terminal route", async () => {
    renderApp("terminal")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Terminal" }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/no terminal sessions/i)).toBeInTheDocument()
  })

  it("exposes a Terminal nav item", () => {
    renderApp("dashboard")
    expect(screen.getByRole("link", { name: "Terminal" })).toBeInTheDocument()
  })
})
