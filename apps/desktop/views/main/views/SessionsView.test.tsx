import { describe, expect, it } from "bun:test"
import { bytesToBase64 } from "@launchkit/pty"
import type { Session, SessionId } from "@launchkit/types"
import { render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import type { XtermInstance } from "../terminal/TerminalPane"
import type { TerminalClient } from "../terminal/terminalClient"
import { createFakeIpcClient } from "../test/fake-client"
import { SessionsView } from "./SessionsView"

const running = {
  id: "s_live",
  harnessId: "claude",
  alias: "fast",
  startedAt: "2026-05-23T10:00:00.000Z",
} as unknown as Session
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
      running: [running],
      recent: [],
      hasMore: false,
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
    })
    render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    expect(screen.getByText(/no session selected/i)).toBeInTheDocument()
  })

  it("renders the running sessions handed in via props in the master", () => {
    const client = createFakeIpcClient({})
    const { master } = SessionsView({
      selectedSessionId: undefined,
      openSessionIds: [],
      running: [running],
      recent: [],
      hasMore: false,
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
    })
    render(
      <IpcClientProvider client={client}>
        <div>{master}</div>
      </IpcClientProvider>,
    )
    // The master no longer fetches — it renders the lists it is handed.
    expect(screen.getByText(/claude · fast/)).toBeInTheDocument()
    expect(client.calls.getSessions.length).toBe(0)
  })

  it("shows an exit banner above the replay for a selected ended session", async () => {
    const ended = {
      id: "s_done",
      harnessId: "claude",
      alias: "fast",
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
      running: [],
      recent: [ended],
      hasMore: false,
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
    })
    const { container } = render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    // The banner + replay pane render once the scrollback resolves (the replay
    // is gated behind the scrollback fetch, like the live→replay transition).
    await waitFor(() =>
      expect(container.querySelector(".replay-exit-banner")).not.toBeNull(),
    )
    const banner = container.querySelector(".replay-exit-banner")
    expect(banner?.textContent).toContain("exited")
    expect(banner?.textContent).toContain("code 0")
    // The read-only replay pane renders alongside the banner.
    expect(
      container.querySelector('.terminal-pane[data-session="s_done"]'),
    ).not.toBeNull()
  })

  it("shows a 'No recorded output' empty state (not a blank terminal) when an ended session has no scrollback (Bug 2)", async () => {
    const ended = {
      id: "s_blank",
      harnessId: "claude",
      alias: "fast",
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
      running: [],
      recent: [ended],
      hasMore: false,
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
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
    expect(container.querySelector(".replay-exit-banner")).not.toBeNull()
    // ... and there is NO terminal pane (it would be blank) and no lingering spinner.
    expect(
      container.querySelector('.terminal-pane[data-session="s_blank"]'),
    ).toBeNull()
    expect(screen.queryByText(/loading session/i)).toBeNull()
  })

  it("keeps an open live pane mounted (hidden) keyed by session id", () => {
    const client = createFakeIpcClient({})
    const { detail } = SessionsView({
      selectedSessionId: "s_live" as SessionId,
      openSessionIds: ["s_live" as SessionId],
      running: [running],
      recent: [],
      hasMore: false,
      onSelect: () => {},
      onNew: () => {},
      onExit: () => {},
      terminalClient: fakeTerminalClient,
      createTerminal: fakeXterm,
    })
    const { container } = render(
      <IpcClientProvider client={client}>
        <div>{detail}</div>
      </IpcClientProvider>,
    )
    expect(container.querySelector('[data-session="s_live"]')).not.toBeNull()
  })
})
