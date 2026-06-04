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

/** Format an ISO `endedAt` for the exit banner; guards the undefined case. */
const formatEndedAt = (endedAt: string | undefined): string =>
  endedAt === undefined ? "" : new Date(endedAt).toLocaleString()

/**
 * Read-only replay for a SELECTED-but-not-open (ended) session: fetches its
 * scrollback unconditionally and renders a replay pane once ready (else a
 * spinner), under a header banner reporting how the run ended. Kept as its own
 * component so `useSessionScrollback` is never behind a branch. `session` may be
 * undefined if the row hasn't loaded yet (e.g. deep-link reload), so the banner
 * is only shown once we have it.
 */
const ReplayDetail = ({
  sessionId,
  session,
  client,
  createTerminal,
}: {
  readonly sessionId: SessionId
  readonly session?: Session
  readonly client: TerminalClient
  readonly createTerminal: CreateTerminal
}): ReactElement => {
  const scrollback = useSessionScrollback(sessionId)
  const ended = formatEndedAt(session?.endedAt)
  // The exit banner is shown above whatever the body resolves to (replay,
  // empty-state, or error), once we have the session row to read its code from.
  const banner =
    session === undefined ? null : (
      <div className="replay-exit-banner">
        {`exited · code ${session.exitCode ?? "?"}`}
        {ended === "" ? null : ` · ended ${ended}`}
      </div>
    )

  // Defense in depth: if the scrollback read failed, say so instead of spinning
  // forever (the store normally returns empty bytes rather than erroring).
  if (scrollback.error !== undefined)
    return (
      <>
        {banner}
        <EmptyState
          title="Could not load output"
          hint="Reading this session's captured terminal output failed. Try selecting it again."
        />
      </>
    )

  // Still loading: undefined data, no error yet.
  if (scrollback.data === undefined) return <Spinner label="Loading session" />

  // Ended sessions that predate output capture (or produced none) have no
  // scrollback file → empty bytes. Render a clear empty-state instead of a blank
  // terminal, which previously looked like "no information" (Bug 2).
  if (scrollback.data.length === 0)
    return (
      <>
        {banner}
        <EmptyState
          title="No recorded output"
          hint="This session has no captured terminal output (it predates output capture, or produced none)."
        />
      </>
    )

  return (
    <>
      {banner}
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
    </>
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
  running,
  recent,
  onExit,
  terminalClient,
  createTerminal,
}: {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly running: readonly Session[]
  readonly recent: readonly Session[]
  readonly onExit: (id: SessionId) => void
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}): ReactElement => {
  const selectedIsOpen =
    selectedSessionId !== undefined &&
    openSessionIds.includes(selectedSessionId)
  // Resolve the full selected session so the replay can show its exit banner.
  const selectedSession = [...running, ...recent].find(
    (s) => s.id === selectedSessionId,
  )

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
          {...(selectedSession === undefined
            ? {}
            : { session: selectedSession })}
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
      running={running}
      recent={recent}
      onExit={onExit}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
    />
  ),
})
