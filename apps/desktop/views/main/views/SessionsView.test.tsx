import { describe, expect, it } from "bun:test"
import type { RunnerOutbound } from "@launchkit/agent-driver"
import type { StoredEvent } from "@launchkit/agent-events"
import { bytesToBase64 } from "@launchkit/pty"
import type { Session, SessionId } from "@launchkit/types"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type React from "react"
import { IpcClientProvider } from "../IpcClientContext"
import type { RunnerClient } from "../runner/runnerClient"
import type { XtermInstance } from "../terminal/TerminalPane"
import type { TerminalClient } from "../terminal/terminalClient"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { SessionsView } from "./SessionsView"

// A minimal fake RunnerClient that tracks attach() calls (mirrors RunDetail.test's fake).
const makeFakeRunner = (): RunnerClient & {
  readonly attached: SessionId[]
} => {
  const attached: SessionId[] = []
  return {
    attached,
    attach: (sid) => attached.push(sid),
    send: () => {},
    approve: () => {},
    interrupt: () => {},
    dispatch: (_m: RunnerOutbound) => {},
    onEvent: (_sid, _cb: (event: StoredEvent) => void) => {},
  }
}

const running = {
  id: "s_live",
  harnessId: "claude",
  modelId: "m_1",
  startedAt: "2026-05-23T10:00:00.000Z",
} as unknown as Session

const project = { id: "prj_1", name: "demo", sessionCount: 1 }

const fakeXterm = (): XtermInstance => ({
  open: () => {},
  write: () => {},
  onData: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  cols: 80,
  rows: 24,
  dispose: () => {},
})
const fakeTerminalClient = {
  onData: () => {},
  onExit: () => {},
  sendInput: () => {},
  sendResize: () => {},
  attach: () => {},
  kill: () => {},
  dispatch: () => {},
} as unknown as TerminalClient

describe("SessionsView", () => {
  it("renders an empty state in the detail when nothing is selected", () => {
    const client = createFakeIpcClient({})
    const { detail } = SessionsView({
      selectedSessionId: undefined,
      openSessionIds: [],
      projects: [project],
      sessionsByProject: { prj_1: [running] },
      collapsed: new Set(),
      allSessions: [running],
      harnesses: [],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: makeFakeRunner(),
    })
    render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    expect(screen.getByText(/no session selected/i)).toBeInTheDocument()
  })

  it("renders the sessions handed in via props in the master as project groups", () => {
    const client = createFakeIpcClient({})
    const { master } = SessionsView({
      selectedSessionId: undefined,
      openSessionIds: [],
      projects: [project],
      sessionsByProject: { prj_1: [running] },
      collapsed: new Set(),
      allSessions: [running],
      harnesses: [],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: makeFakeRunner(),
    })
    render(
      <IpcClientProvider client={client}>
        <div>{master}</div>
      </IpcClientProvider>,
    )
    // The master renders project groups — no data fetching here.
    expect(screen.getByText(/claude · m_1/)).toBeInTheDocument()
    expect(client.calls.getSessions.length).toBe(0)
    expect(client.calls.getProjects.length).toBe(0)
  })

  it("shows an exit banner above the replay for a selected ended session", async () => {
    const ended = {
      id: "s_done",
      harnessId: "claude",
      modelId: "m_1",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:05:00.000Z",
      exitCode: 0,
    } as unknown as Session
    const client = createFakeIpcClient({
      getSessionScrollback: async () => ({
        ok: true as const,
        // Non-empty captured bytes → the replay pane renders (the empty case is
        // covered by the "No recorded output" test below).
        value: { bytesBase64: bytesToBase64(new Uint8Array([104, 105])) },
      }),
    })
    const { detail } = SessionsView({
      selectedSessionId: "s_done" as SessionId,
      // Not in the open set → renders the read-only replay (+ banner).
      openSessionIds: [],
      projects: [{ id: "prj_1", name: "demo", sessionCount: 1 }],
      sessionsByProject: { prj_1: [ended] },
      collapsed: new Set(),
      allSessions: [ended],
      harnesses: [],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: makeFakeRunner(),
    })
    const { container } = render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    // The banner + replay pane render once the scrollback resolves (the replay
    // is gated behind the scrollback fetch, like the live→replay transition).
    await waitFor(() =>
      expect(container.querySelector(".lk-replay-banner")).not.toBeNull(),
    )
    const banner = container.querySelector(".lk-replay-banner")
    expect(banner?.textContent).toContain("exited")
    expect(banner?.textContent).toContain("code 0")
    // The read-only replay pane renders alongside the banner.
    expect(
      container.querySelector('.lk-terminal-pane[data-session="s_done"]'),
    ).not.toBeNull()
  })

  it("shows a 'No recorded output' empty state (not a blank terminal) when an ended session has no scrollback (Bug 2)", async () => {
    const ended = {
      id: "s_blank",
      harnessId: "claude",
      modelId: "m_1",
      startedAt: "2026-05-23T10:00:00.000Z",
      endedAt: "2026-05-23T10:05:00.000Z",
      exitCode: 0,
    } as unknown as Session
    const client = createFakeIpcClient({
      // Old sessions have no scrollback file → the store returns empty bytes.
      getSessionScrollback: async () => ({
        ok: true as const,
        value: { bytesBase64: "" },
      }),
    })
    const { detail } = SessionsView({
      selectedSessionId: "s_blank" as SessionId,
      openSessionIds: [],
      projects: [{ id: "prj_1", name: "demo", sessionCount: 1 }],
      sessionsByProject: { prj_1: [ended] },
      collapsed: new Set(),
      allSessions: [ended],
      harnesses: [],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: makeFakeRunner(),
    })
    const { container } = render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    // The empty-state message renders (once the empty scrollback resolves) ...
    await waitFor(() =>
      expect(screen.getByText(/no recorded output/i)).toBeInTheDocument(),
    )
    // ... under the exit banner ...
    expect(container.querySelector(".lk-replay-banner")).not.toBeNull()
    // ... and there is NO terminal pane (it would be blank) and no lingering spinner.
    expect(
      container.querySelector('.lk-terminal-pane[data-session="s_blank"]'),
    ).toBeNull()
    expect(screen.queryByText(/loading session/i)).toBeNull()
  })

  it("keeps an open live pane mounted (hidden) keyed by session id", () => {
    const client = createFakeIpcClient({})
    const runner = makeFakeRunner()
    const { detail } = SessionsView({
      selectedSessionId: "s_live" as SessionId,
      openSessionIds: ["s_live" as SessionId],
      projects: [project],
      sessionsByProject: { prj_1: [running] },
      collapsed: new Set(),
      allSessions: [running],
      harnesses: [{ id: "claude", native: false }],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: runner,
    })
    const { container } = render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    expect(container.querySelector('[data-session="s_live"]')).not.toBeNull()
  })

  it("renders the native RunDetail (live) for an open native session", () => {
    const native: Session = {
      id: "s_native" as Session["id"],
      harnessId: "demo" as Session["harnessId"],
      startedAt: "2026-06-08T10:00:00.000Z",
    } as unknown as Session
    const runner = makeFakeRunner()
    const { detail } = SessionsView({
      selectedSessionId: native.id,
      openSessionIds: [native.id],
      projects: [],
      sessionsByProject: {},
      collapsed: new Set(),
      allSessions: [native],
      harnesses: [{ id: "demo", native: true }],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: runner,
    })
    renderWithProviders(detail as React.ReactElement, createFakeIpcClient({}))
    expect(runner.attached).toEqual([native.id]) // native path attached, not a terminal pane
    cleanup()
  })

  it("still renders a terminal pane (not RunDetail) for a non-native session", () => {
    const term: Session = {
      id: "s_term" as Session["id"],
      harnessId: "claude" as Session["harnessId"],
      startedAt: "2026-06-08T10:00:00.000Z",
    } as unknown as Session
    const runner = makeFakeRunner()
    const { detail } = SessionsView({
      selectedSessionId: term.id,
      openSessionIds: [term.id],
      projects: [],
      sessionsByProject: {},
      collapsed: new Set(),
      allSessions: [term],
      harnesses: [{ id: "claude", native: false }],
      onToggle: () => {},
      onMore: () => {},
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
      runnerClient: runner,
    })
    renderWithProviders(detail as React.ReactElement, createFakeIpcClient({}))
    expect(runner.attached).toEqual([]) // terminal path: runner socket never attached
    cleanup()
  })
})
