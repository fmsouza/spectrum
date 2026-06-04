import type { Session, SessionId } from "@launchkit/types"
import { EmptyState, SessionList, Spinner } from "@launchkit/ui"
import type { ReactElement, ReactNode } from "react"
import { useSessionScrollback } from "../hooks/useSessionScrollback"
import { type CreateTerminal, TerminalPane } from "../terminal/TerminalPane"
import type { TerminalClient } from "../terminal/terminalClient"

export type SessionsViewInput = {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  /** Running sessions (`endedAt === undefined`), fetched by the shell. */
  readonly running: readonly Session[]
  /** Ended sessions, fetched by the shell. */
  readonly recent: readonly Session[]
  /** Whether the recent list is truncated (drives the "View more" button). */
  readonly hasMore: boolean
  /** Load the next page of ended sessions (bumps the recent limit in the shell). */
  readonly onMore: () => void
  readonly onSelect: (id: SessionId) => void
  readonly onNew: () => void
  /**
   * Called with a live session's id when its pty exits, so the shell can drop
   * the id from the open set and refetch the list (live → replay transition).
   */
  readonly onExit: (id: SessionId) => void
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}

/**
 * The sessions master: renders the dumb `SessionList` from the running/recent
 * lists the shell fetched. Data enters via props (the `useSessions` hook lives
 * in the shell so a launch/exit can refetch it).
 */
const SessionsMaster = ({
  selectedSessionId,
  running,
  recent,
  hasMore,
  onSelect,
  onMore,
  onNew,
}: {
  readonly selectedSessionId?: SessionId
  readonly running: readonly Session[]
  readonly recent: readonly Session[]
  readonly hasMore: boolean
  readonly onSelect: (id: SessionId) => void
  readonly onMore: () => void
  readonly onNew: () => void
}): ReactElement => (
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
    hasMore={hasMore}
    onSelect={onSelect}
    onMore={onMore}
    onNew={onNew}
  />
)

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
      // Key by session id so switching between two ended sessions remounts the
      // pane — otherwise it would briefly show the previous session's
      // scrollback while the next one's bytes load.
      key={sessionId}
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
  onExit,
  terminalClient,
  createTerminal,
}: {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly onExit: (id: SessionId) => void
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
              onExit={() => onExit(id)}
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
 * Sessions master/detail factory for `AppShell`. The shell (`app.tsx`) owns the
 * selection + open-set state, the session list (via `useSessions`), and the
 * launch/exit flow; this view wires the dumb `SessionList` and the terminal
 * panes from the props it is handed.
 */
export const SessionsView = ({
  selectedSessionId,
  openSessionIds,
  running,
  recent,
  hasMore,
  onMore,
  onSelect,
  onNew,
  onExit,
  terminalClient,
  createTerminal,
}: SessionsViewInput): {
  readonly master: ReactNode
  readonly detail: ReactNode
} => ({
  master: (
    <SessionsMaster
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      running={running}
      recent={recent}
      hasMore={hasMore}
      onSelect={onSelect}
      onMore={onMore}
      onNew={onNew}
    />
  ),
  detail: (
    <SessionsDetail
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      openSessionIds={openSessionIds}
      onExit={onExit}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
    />
  ),
})
