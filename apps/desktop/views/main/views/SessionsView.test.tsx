import { describe, expect, it } from "bun:test"
import type { Session, SessionId } from "@launchkit/types"
import { render, screen } from "@testing-library/react"
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
