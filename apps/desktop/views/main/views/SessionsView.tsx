import type { Session, SessionId } from "@launchkit/types"
import { EmptyState, SessionList, Spinner } from "@launchkit/ui"
import type { ReactElement, ReactNode } from "react"
import { useSessionScrollback } from "../hooks/useSessionScrollback"
import { useSessions } from "../hooks/useSessions"
import { type CreateTerminal, TerminalPane } from "../terminal/TerminalPane"
import type { TerminalClient } from "../terminal/terminalClient"

export type SessionsViewInput = {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly onSelect: (id: SessionId) => void
  readonly onNew: () => void
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}

/**
 * The sessions master: loads sessions, splits running (`endedAt === undefined`)
 * from recent, and renders the dumb `SessionList`. The hook lives here (not
 * behind a branch in the factory) so its call order is stable.
 */
const SessionsMaster = ({
  selectedSessionId,
  onSelect,
  onNew,
}: {
  readonly selectedSessionId?: SessionId
  readonly onSelect: (id: SessionId) => void
  readonly onNew: () => void
}): ReactElement => {
  const sessions = useSessions()
  const all = sessions.data ?? []
  const running = all.filter((s) => s.endedAt === undefined)
  const recent = all.filter((s) => s.endedAt !== undefined)

  return (
    <SessionList
      running={running}
      recent={recent}
      labelFor={(s: Session) => ({
        harnessName: String(s.harnessId),
        model: String(s.alias),
      })}
      {...(selectedSessionId === undefined
        ? {}
        : { selectedId: selectedSessionId })}
      hasMore={false}
      onSelect={onSelect}
      onMore={() => {}}
      onNew={onNew}
    />
  )
}

/**
 * Read-only replay for a SELECTED-but-not-open (ended) session: fetches its
 * scrollback unconditionally and renders a replay pane once ready (else a
 * spinner). Kept as its own component so `useSessionScrollback` is never behind
 * a branch.
 */
const ReplayDetail = ({
  sessionId,
  client,
  createTerminal,
}: {
  readonly sessionId: SessionId
  readonly client: TerminalClient
  readonly createTerminal: CreateTerminal
}): ReactElement => {
  const scrollback = useSessionScrollback(sessionId)
  if (scrollback.data === undefined) return <Spinner label="Loading session" />
  return (
    <TerminalPane
      mode="replay"
      sessionId={sessionId}
      client={client}
      createTerminal={createTerminal}
      bytes={scrollback.data}
    />
  )
}

/**
 * The sessions detail. Every OPEN session keeps its own mounted live
 * `TerminalPane` (hidden when not selected) so xterm scrollback survives
 * selection changes — mirrors the old tabbed `TerminalPage` mounted-hidden
 * pattern, replacing tab selection with the vertical session list. A selected
 * ended session (not in the open set) shows a read-only replay; nothing
 * selected shows an empty state.
 */
const SessionsDetail = ({
  selectedSessionId,
  openSessionIds,
  terminalClient,
  createTerminal,
}: {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}): ReactElement => {
  const selectedIsOpen =
    selectedSessionId !== undefined &&
    openSessionIds.includes(selectedSessionId)

  return (
    <div className="sessions-detail">
      <div className="terminal-panes">
        {openSessionIds.map((id) => (
          <div
            key={id}
            className="terminal-pane-host"
            data-active={id === selectedSessionId}
            hidden={id !== selectedSessionId}
          >
            <TerminalPane
              mode="live"
              sessionId={id}
              client={terminalClient}
              createTerminal={createTerminal}
            />
          </div>
        ))}
      </div>
      {selectedSessionId !== undefined && !selectedIsOpen ? (
        <ReplayDetail
          sessionId={selectedSessionId}
          client={terminalClient}
          createTerminal={createTerminal}
        />
      ) : null}
      {selectedSessionId === undefined ? (
        <EmptyState
          title="No session selected"
          hint="Pick a session from the list, or start a new one."
        />
      ) : null}
    </div>
  )
}

/**
 * Sessions master/detail factory for `AppShell`. The page (`app.tsx`) owns the
 * selection + open-set state and the launch flow; this view wires the dumb
 * `SessionList` and the terminal panes.
 */
export const SessionsView = ({
  selectedSessionId,
  openSessionIds,
  onSelect,
  onNew,
  terminalClient,
  createTerminal,
}: SessionsViewInput): {
  readonly master: ReactNode
  readonly detail: ReactNode
} => ({
  master: (
    <SessionsMaster
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      onSelect={onSelect}
      onNew={onNew}
    />
  ),
  detail: (
    <SessionsDetail
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      openSessionIds={openSessionIds}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
    />
  ),
})
