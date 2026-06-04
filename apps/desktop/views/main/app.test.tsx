import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

  it("renders the AppShell in sessions mode by default", async () => {
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

  it("opens the new-session modal and launches via launchHarness from the sessions header", async () => {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({
        ok: true as const,
        value: [
          {
            id: "claude",
            name: "Claude Code",
            command: "claude",
            apiFormat: "anthropic",
            envTemplate: {},
            defaultAlias: "fast",
            builtIn: true,
          },
        ],
      }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
      getAliases: async () => ({
        ok: true as const,
        value: [
          { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" },
        ],
      }),
      launchHarness: async () => ({
        ok: true as const,
        value: { sessionId: "s_new" },
      }),
    })
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    // Open the modal via SessionList's "+ New session" button (Phase 6 / U.7).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /new session/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /new session/i }))
    // NewSessionModal (Phase 6 / U.11) submit control is the "Launch" button;
    // harness/alias default to the first option.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /launch/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    expect(client.calls.launchHarness[0]).toMatchObject({ id: "claude" })
    await waitFor(() => expect(window.location.hash).toBe("#sessions/s_new"))
  })

  it("also calls addProfile when 'Save edits as new profile' is checked", async () => {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({
        ok: true as const,
        value: [
          {
            id: "claude",
            name: "Claude Code",
            command: "claude",
            apiFormat: "anthropic",
            envTemplate: {},
            defaultAlias: "fast",
            builtIn: true,
          },
        ],
      }),
      getAliases: async () => ({
        ok: true as const,
        value: [
          { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" },
        ],
      }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
      addProfile: async () => ({
        ok: true as const,
        value: {
          id: "pr_1",
          name: "Work",
          harnessId: "claude",
          alias: "fast",
          env: {},
        },
      }),
      launchHarness: async () => ({
        ok: true as const,
        value: { sessionId: "s_new" },
      }),
    })
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    // Field labels are defined in Phase 6 / U.11: "Name", "Folder",
    // "Save edits as new profile", "Profile name".
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "auth-refactor" },
    })
    fireEvent.change(screen.getByLabelText("Folder"), {
      target: { value: "/tmp/app" },
    })
    fireEvent.click(screen.getByLabelText(/save edits as new profile/i))
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "Work" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
    expect(client.calls.addProfile[0]).toMatchObject({
      name: "Work",
      harnessId: "claude",
      alias: "fast",
    })
  })
})
