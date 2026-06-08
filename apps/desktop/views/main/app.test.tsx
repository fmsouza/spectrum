import { describe, expect, it } from "bun:test"
import type { SessionId } from "@launchkit/types"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

/**
 * A terminal client whose `onExit` registrations are captured so a test can fire
 * the exit for a given session id and drive the live→replay transition.
 */
const controllableTerminalClient = (): {
  readonly client: TerminalClient
  readonly fireExit: (id: SessionId, code: number) => void
} => {
  const exits = new Map<SessionId, (code: number) => void>()
  const client = {
    onData: () => {},
    onExit: (id: SessionId, cb: (code: number) => void) => {
      exits.set(id, cb)
    },
    sendInput: () => {},
    sendResize: () => {},
    attach: () => {},
    kill: () => {},
    dispatch: () => {},
  } as unknown as TerminalClient
  return { client, fireExit: (id, code) => exits.get(id)?.(code) }
}

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
  getModels: async () => ({ ok: true as const, value: [] }),
  getProviders: async () => ({ ok: true as const, value: [] }),
  getProjects: async () => ({ ok: true as const, value: [] }),
  setCollapsedProjects: async () => ({ ok: true as const, value: null }),
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
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
    // harness/model default to the first option.
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

  it("keeps the modal open and shows the error when launchHarness fails (Bug 1)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      launchHarness: async () => ({
        ok: false as const,
        error: { kind: "handler-failed" as const, detail: "boom: no key" },
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
    fireEvent.click(await screen.findByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    // The error surfaces in the modal's alert ...
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/boom: no key/i),
    )
    // ... the modal stays open (Launch still on screen) and the view is NOT
    // switched to the (nonexistent) session.
    expect(screen.getByRole("button", { name: /launch/i })).toBeInTheDocument()
    expect(window.location.hash).not.toContain("/")
  })

  it("sends name 'Untitled' to launchHarness (Fix #3, formerly Bug 1)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
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
    // Name field is removed (Fix #3); modal always submits name:"Untitled"
    fireEvent.click(await screen.findByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    const params = client.calls.launchHarness[0] as Record<string, unknown>
    expect(params.name).toBe("Untitled")
    expect("cwd" in params).toBe(false)
  })

  it("refetches projects after a successful launch", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
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
    // On mount, getProjects is called at least once.
    await waitFor(() =>
      expect(client.calls.getProjects.length).toBeGreaterThan(0),
    )
    const projectsCountBefore = client.calls.getProjects.length
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    fireEvent.click(await screen.findByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    // After a successful launch, projects are invalidated and refetched.
    await waitFor(() =>
      expect(client.calls.getProjects.length).toBeGreaterThan(
        projectsCountBefore,
      ),
    )
  })

  it("fetches projects on initial render", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    // The shell now fetches projects first; per-project session pages load lazily.
    await waitFor(() =>
      expect(client.calls.getProjects.length).toBeGreaterThan(0),
    )
  })

  it("requests the next page when 'Show 10 more' is clicked on a project group", async () => {
    // Project reports 15 sessions; first page loads 10 → "Show 10 more" button renders.
    const page = Array.from({ length: 10 }, (_, i) => ({
      id: `s_${i}`,
      harnessId: "claude",
      modelId: "m_1",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:05:00.000Z",
      exitCode: 0,
    }))
    const client = createFakeIpcClient({
      ...baseStubs,
      getProjects: async () => ({
        ok: true as const,
        value: [{ id: "prj_1", name: "demo", path: "/demo", sessionCount: 15 }],
      }),
      getSessions: async () => ({
        ok: true as const,
        value: page,
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
    fireEvent.click(
      await screen.findByRole("button", { name: /show 10 more/i }),
    )
    // Bumping the limit re-runs the session query with the larger page size.
    await waitFor(() =>
      expect(client.calls.getSessions).toContainEqual({
        projectId: "prj_1",
        limit: 20,
      }),
    )
  })

  it("hides the 'Show 10 more' button when all project sessions are loaded", async () => {
    // Project reports 1 session; loaded page also has 1 → no more to load.
    const page = [
      {
        id: "s_0",
        harnessId: "claude",
        modelId: "m_1",
        startedAt: "2026-05-23T10:00:00.000Z",
        endedAt: "2026-05-23T10:05:00.000Z",
        exitCode: 0,
      },
    ]
    const client = createFakeIpcClient({
      ...baseStubs,
      getProjects: async () => ({
        ok: true as const,
        value: [{ id: "prj_1", name: "demo", path: "/demo", sessionCount: 1 }],
      }),
      getSessions: async () => ({
        ok: true as const,
        value: page,
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
    await waitFor(() =>
      expect(screen.getByText(/claude · m_1/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: /show 10 more/i })).toBeNull()
  })

  it("transitions an open live session to replay when it exits", async () => {
    const live = {
      id: "s_new",
      harnessId: "claude",
      modelId: "m_1",
      startedAt: "2026-05-23T10:00:00.000Z",
    }
    const ended = { ...live, endedAt: "2026-05-23T10:05:00.000Z" }
    // Before launch the session does not exist; after the exit refetch it is
    // reported as ended so the master moves it to the project group.
    let exited = false
    const { client: terminalClient, fireExit } = controllableTerminalClient()
    const client = createFakeIpcClient({
      ...baseStubs,
      getProjects: async () => ({
        ok: true as const,
        value: [{ id: "prj_1", name: "demo", path: "/demo", sessionCount: 1 }],
      }),
      getSessions: async () => ({
        ok: true as const,
        value: exited ? [ended] : [live],
      }),
      getSessionScrollback: async () => ({
        ok: true as const,
        // Non-empty bytes so the replay pane (not the new empty-state) renders;
        // this test asserts the live→replay pane transition, see Bug 2.
        value: { bytesBase64: "aGk=" },
      }),
      getHarnesses: async () => ({
        ok: true as const,
        value: [
          {
            id: "claude",
            name: "Claude Code",
            command: "claude",
            apiFormat: "anthropic",
            envTemplate: {},
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      launchHarness: async () => ({
        ok: true as const,
        value: { sessionId: "s_new" },
      }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={terminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    // Launch + select the live session: a live pane host (the wrapper that keeps
    // the pane mounted/hidden) mounts for it.
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    fireEvent.click(await screen.findByRole("button", { name: /launch/i }))
    await waitFor(() => expect(window.location.hash).toBe("#sessions/s_new"))
    await waitFor(() =>
      expect(
        container.querySelector(
          ".lk-terminal-pane-host:not(.lk-terminal-pane-host--replay)",
        ),
      ).not.toBeNull(),
    )
    // Sanity: no replay pane yet — the live pane is wrapped in a host, so a
    // direct child of lk-sessions-detail is not a terminal pane.
    expect(
      container.querySelector(".lk-sessions-detail > .lk-terminal-pane"),
    ).toBeNull()

    // The session exits: its dead live pane host must unmount and the read-only
    // replay pane must render instead (it is no longer in the open set). Wrap in
    // act because firing the exit synchronously drives React state updates.
    exited = true
    act(() => fireExit("s_new" as SessionId, 0))
    await waitFor(() =>
      expect(
        container.querySelector(
          ".lk-terminal-pane-host:not(.lk-terminal-pane-host--replay)",
        ),
      ).toBeNull(),
    )
    await waitFor(() =>
      expect(client.calls.getSessionScrollback.length).toBeGreaterThan(0),
    )
    // The replay pane is wrapped inside lk-replay > lk-terminal-pane-host--replay;
    // it renders once the scrollback resolves into state.
    await waitFor(() =>
      expect(
        container.querySelector(
          '.lk-terminal-pane-host--replay .lk-terminal-pane[data-session="s_new"]',
        ),
      ).not.toBeNull(),
    )
  })

  it("refetches getModels (and getHarnesses) when the new-session modal is opened (Fix #1)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
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
    // Wait for initial render — hooks fire on mount for models, harnesses
    await waitFor(() =>
      expect(client.calls.getModels.length).toBeGreaterThan(0),
    )
    const countBefore = client.calls.getModels.length

    // Open the modal via "+ New session" button — onNew should trigger refetch
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))

    // After opening, getModels should have been called again
    await waitFor(() =>
      expect(client.calls.getModels.length).toBeGreaterThan(countBefore),
    )
    // Same for getHarnesses
    const harnessCountAfterOpen = client.calls.getHarnesses.length
    expect(harnessCountAfterOpen).toBeGreaterThan(0)
  })

  it("sets the folder field in the modal when pickFolder returns a real path (Fix #2)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      pickFolder: async () => ({
        ok: true as const,
        value: { path: "/Users/me/myproject" },
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
    // Open modal then click Browse
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    await screen.findByRole("button", { name: /launch/i })
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    // After Browse resolves, the Folder field should show the returned path
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /folder/i })).toHaveValue(
        "/Users/me/myproject",
      ),
    )
  })

  it("prefills the folder field from the persisted lastSelectedFolder setting (B2)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      getSettings: async () => ({
        ok: true as const,
        value: {
          lastSelectedFolder: "/seed/dir",
          lastSelectedHarnessId: "",
          lastSelectedModelId: "",
          collapsedProjects: [],
        },
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
    // Open the modal; its Folder field should already carry the persisted folder.
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    await screen.findByRole("button", { name: /launch/i })
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /folder/i })).toHaveValue(
        "/seed/dir",
      ),
    )
  })

  it("prefills harness and model in the New Session modal from settings", async () => {
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
            builtIn: true,
          },
          {
            id: "codex",
            name: "Codex",
            command: "codex",
            apiFormat: "openai",
            envTemplate: {},
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [
          { id: "mdl_fast", providerId: "p_openai", providerModel: "gpt-4o" },
        ],
      }),
      getSettings: async () => ({
        ok: true as const,
        value: {
          lastSelectedFolder: "/seed/dir",
          lastSelectedHarnessId: "codex",
          lastSelectedModelId: "mdl_fast",
          collapsedProjects: [],
        },
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
    // Open the modal; the harness/model selects must carry the persisted ids
    // (page-level fetch → props), not the first-harness / default fallbacks.
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    await screen.findByRole("button", { name: /launch/i })
    await waitFor(() =>
      expect(screen.getByLabelText("Harness")).toHaveValue("codex"),
    )
    expect(screen.getByLabelText("Model")).toHaveValue("mdl_fast")
  })

  it("surfaces a pickFolder error as an alert in the modal (Fix #2)", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      pickFolder: async () => ({
        ok: false as const,
        error: { kind: "handler-failed" as const, detail: "dialog failed" },
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
    // Open modal then click Browse (which will fail)
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    await screen.findByRole("button", { name: /launch/i })
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    // The error should be surfaced as an alert
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/dialog failed/i),
    )
  })

  it("uses a folder-picker error label (not 'Could not launch session') when pickFolder fails", async () => {
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
            builtIn: true,
          },
        ],
      }),
      getModels: async () => ({
        ok: true as const,
        value: [{ id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }],
      }),
      pickFolder: async () => ({
        ok: false as const,
        error: { kind: "handler-failed" as const, detail: "access denied" },
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
    await screen.findByRole("button", { name: /launch/i })
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/folder picker/i),
    )
    // Must NOT use the session-launch label for a folder-picker failure
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      /could not launch session/i,
    )
  })
})
