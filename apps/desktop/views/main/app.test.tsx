import { describe, expect, it } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import { App } from "./app"
import type { XtermInstance } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
import { createFakeIpcClient } from "./test/fake-client"

const fakeTerminalClient: TerminalClient = {
  onData: () => {},
  onExit: () => {},
  sendInput: () => {},
  sendResize: () => {},
  attach: () => {},
  kill: () => {},
  dispatch: () => {},
} as unknown as TerminalClient

const fakeXterm = (): XtermInstance => ({
  open: () => {},
  write: () => {},
  onData: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  cols: 80,
  rows: 24,
  dispose: () => {},
})

const baseStubs = {
  getSessions: async () => ({ ok: true as const, value: [] }),
  getHarnesses: async () => ({ ok: true as const, value: [] }),
  getProxyStatus: async () => ({
    ok: true as const,
    value: { running: false, port: 4000 },
  }),
  getProfiles: async () => ({ ok: true as const, value: [] }),
  getAliases: async () => ({ ok: true as const, value: [] }),
}

describe("App view model", () => {
  it("defaults to the sessions view and writes #sessions to the hash", async () => {
    window.location.hash = ""
    const client = createFakeIpcClient(baseStubs)
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
      />,
    )
    await waitFor(() => expect(window.location.hash).toBe("#sessions"))
  })

  it("parses #settings/providers into the settings view on the matching section", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/providers"
      />,
    )
    await waitFor(() =>
      expect(window.location.hash).toBe("#settings/providers"),
    )
  })

  it("maps the retired #dashboard hash to the sessions view", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="dashboard"
      />,
    )
    await waitFor(() => expect(window.location.hash).toBe("#sessions"))
  })
})
