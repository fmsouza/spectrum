import type { Session, SessionId } from "@launchkit/types"
import { EmptyState, ProjectList, Spinner } from "@launchkit/ui"
import type { ProjectSummary } from "@launchkit/ui"
import type { ReactElement, ReactNode } from "react"
import { useSessionScrollback } from "../hooks/useSessionScrollback"
import { isNativeHarness } from "../native/isNativeHarness"
import type { RunnerClient } from "../runner/runnerClient"
import { type CreateTerminal, TerminalPane } from "../terminal/TerminalPane"
import type { TerminalClient } from "../terminal/terminalClient"
import { RunDetail } from "./RunDetail"

export type SessionsViewInput = {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly projects: readonly ProjectSummary[]
  readonly sessionsByProject: Readonly<Record<string, readonly Session[]>>
  readonly collapsed: ReadonlySet<string>
  readonly allSessions: readonly Session[]
  readonly onToggle: (projectId: string) => void
  readonly onMore: (projectId: string) => void
  readonly onSelect: (id: SessionId) => void
  readonly onNew: () => void
  /**
   * Called with a live session's id when its pty exits, so the shell can drop
   * the id from the open set and refetch the list (live → replay transition).
   */
  readonly onExit: (id: SessionId) => void
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
  readonly runnerClient: RunnerClient
}

/**
 * The sessions master: renders the dumb `ProjectList` from the projects/sessions
 * the shell fetched. Data enters via props (the `useProjects` hook lives
 * in the shell so a launch/exit can refetch it).
 */
const SessionsMaster = ({
  selectedSessionId,
  projects,
  sessionsByProject,
  collapsed,
  onToggle,
  onSelect,
  onMore,
  onNew,
}: {
  readonly selectedSessionId?: SessionId
  readonly projects: readonly ProjectSummary[]
  readonly sessionsByProject: Readonly<Record<string, readonly Session[]>>
  readonly collapsed: ReadonlySet<string>
  readonly onToggle: (projectId: string) => void
  readonly onSelect: (id: SessionId) => void
  readonly onMore: (projectId: string) => void
  readonly onNew: () => void
}): ReactElement => (
  <ProjectList
    projects={projects}
    sessionsByProject={sessionsByProject}
    collapsed={collapsed}
    {...(selectedSessionId === undefined
      ? {}
      : { selectedId: selectedSessionId })}
    labelFor={(s: Session) => ({
      harnessName: String(s.harnessId),
      model: s.modelId !== undefined ? String(s.modelId) : "default",
    })}
    onToggle={onToggle}
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
      <div className="lk-replay-banner">
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

  // C.2: wrap the banner + pane in lk-replay so flex geometry resolves
  // correctly — the banner is flex:0 0 auto and the pane host grows to fill.
  return (
    <div className="lk-replay">
      {banner}
      <div className="lk-terminal-pane-host lk-terminal-pane-host--replay">
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
      </div>
    </div>
  )
}

/**
 * The sessions detail. Every OPEN session keeps its own mounted live
 * `TerminalPane` (hidden when not selected) so xterm scrollback survives
 * selection changes — mirrors the old tabbed `TerminalPage` mounted-hidden
 * pattern, replacing tab selection with the vertical session list. A selected
 * ended session (not in the open set) shows a read-only replay; nothing
 * selected shows an empty state.
 *
 * Native-backed sessions (e.g. the dev "demo" harness) are routed to
 * `RunDetail` instead of the terminal; this is purely additive — non-native
 * sessions render the terminal exactly as before.
 */
const SessionsDetail = ({
  selectedSessionId,
  openSessionIds,
  allSessions,
  onExit,
  terminalClient,
  createTerminal,
  runnerClient,
}: {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly allSessions: readonly Session[]
  readonly onExit: (id: SessionId) => void
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
  readonly runnerClient: RunnerClient
}): ReactElement => {
  const selectedIsOpen =
    selectedSessionId !== undefined &&
    openSessionIds.includes(selectedSessionId)
  // Resolve the full selected session so the replay can show its exit banner.
  const selectedSession = allSessions.find((s) => s.id === selectedSessionId)

  // Native-backed sessions render the native conversation (RunView/RunReplay)
  // instead of the terminal. Selection mirrors the backend driver registry via
  // the pure isNativeHarness predicate; terminal sessions are unchanged.
  if (
    selectedSession !== undefined &&
    isNativeHarness(selectedSession.harnessId)
  ) {
    const isOpen = openSessionIds.includes(selectedSession.id)
    return (
      <div className="lk-sessions-detail">
        <RunDetail
          key={selectedSession.id}
          mode={isOpen ? "live" : "replay"}
          sessionId={selectedSession.id}
          runnerClient={runnerClient}
        />
      </div>
    )
  }

  return (
    <div className="lk-sessions-detail">
      <div className="lk-terminal-panes">
        {openSessionIds.map((id) => (
          <div
            key={id}
            className="lk-terminal-pane-host"
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
 * selection + open-set state, the project/session list (via `useProjects`), and the
 * launch/exit flow; this view wires the dumb `ProjectList` and the terminal
 * panes from the props it is handed.
 */
export const SessionsView = ({
  selectedSessionId,
  openSessionIds,
  projects,
  sessionsByProject,
  collapsed,
  allSessions,
  onToggle,
  onMore,
  onSelect,
  onNew,
  onExit,
  terminalClient,
  createTerminal,
  runnerClient,
}: SessionsViewInput): {
  readonly master: ReactNode
  readonly detail: ReactNode
} => ({
  master: (
    <SessionsMaster
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      projects={projects}
      sessionsByProject={sessionsByProject}
      collapsed={collapsed}
      onToggle={onToggle}
      onSelect={onSelect}
      onMore={onMore}
      onNew={onNew}
    />
  ),
  detail: (
    <SessionsDetail
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      openSessionIds={openSessionIds}
      allSessions={allSessions}
      onExit={onExit}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
      runnerClient={runnerClient}
    />
  ),
})
