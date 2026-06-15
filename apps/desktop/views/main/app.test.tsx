import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { App } from "./app"
import type { RunnerClient } from "./runner/runnerClient"
import { createFakeIpcClient } from "./test/fake-client"

const fakeRunnerClient: RunnerClient = {
  attach: () => {},
  send: () => {},
  approve: () => {},
  interrupt: () => {},
  dispatch: () => {},
  onEvent: () => {},
  onAny: () => () => {},
} as unknown as RunnerClient

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
  it("mounts the toast stack in the app shell", async () => {
    const client = createFakeIpcClient(baseStubs)
    const { container } = render(
      <App client={client} runnerClient={fakeRunnerClient} />,
    )
    // The notifications engine's ToastContainer is mounted in the shell; its
    // (initially empty) stack container is always present.
    await waitFor(() =>
      expect(container.querySelector(".lk-toast-stack")).not.toBeNull(),
    )
  })

  it("defaults to the sessions view and writes #sessions to the hash", async () => {
    window.location.hash = ""
    const client = createFakeIpcClient(baseStubs)
    render(<App client={client} runnerClient={fakeRunnerClient} />)
    await waitFor(() => expect(window.location.hash).toBe("#sessions"))
  })

  it("parses #settings/providers into the settings view on the matching section", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(
      <App
        client={client}
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
        initialView="dashboard"
      />,
    )
    await waitFor(() => expect(window.location.hash).toBe("#sessions"))
  })

  it("renders the AppShell in sessions mode by default", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(<App client={client} runnerClient={fakeRunnerClient} />)
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
        initialView="sessions"
      />,
    )
    await waitFor(() =>
      expect(screen.getByText(/claude · m_1/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: /show 10 more/i })).toBeNull()
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
          collapsedProjects: [],
        },
      }),
    })
    render(
      <App
        client={client}
        runnerClient={fakeRunnerClient}
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

  it("prefills the harness from settings (the modal no longer carries a model field)", async () => {
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
          collapsedProjects: [],
        },
      }),
    })
    render(
      <App
        client={client}
        runnerClient={fakeRunnerClient}
        initialView="sessions"
      />,
    )
    // Open the modal; the harness select must carry the persisted id
    // (page-level fetch → props), not the first-harness fallback.
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    await screen.findByRole("button", { name: /launch/i })
    await waitFor(() =>
      expect(screen.getByLabelText("Harness")).toHaveValue("codex"),
    )
    // The Model field is gone — model selection lives in the composer now.
    expect(screen.queryByLabelText("Model")).toBeNull()
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
        runnerClient={fakeRunnerClient}
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
        runnerClient={fakeRunnerClient}
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
