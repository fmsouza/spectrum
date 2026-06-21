import type { ModelRoute, Session, SessionId } from "@spectrum/types"
import { EmptyState, ProjectList } from "@spectrum/ui"
import type { ProjectSummary } from "@spectrum/ui"
import type { ReactElement, ReactNode } from "react"
import type { RunnerClient } from "../runner/runnerClient"
import { RunDetail } from "./RunDetail"

/**
 * Human-readable model label for a session row: resolves the route id to
 * "<provider name> / <providerModel>". Falls back to the raw id if the route
 * was deleted, and "default" when the session has no model (proxy-less route).
 */
export const sessionModelLabel = (
  modelId: string | undefined,
  models: readonly ModelRoute[],
  providerNames: Readonly<Record<string, string>>,
): string => {
  if (modelId === undefined) return "default"
  const route = models.find((m) => String(m.id) === modelId)
  if (route === undefined) return modelId
  const provider =
    providerNames[String(route.providerId)] ?? String(route.providerId)
  return `${provider} / ${route.providerModel}`
}

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
  readonly onDeleteProject: (projectId: string) => void
  readonly onDeleteSession: (sessionId: SessionId) => void
  readonly onRename?: ((id: SessionId, name: string) => void) | undefined
  readonly runnerClient: RunnerClient
  /** All model routes, threaded to `RunDetail` so the composer can render a picker. */
  readonly models?: readonly ModelRoute[]
  /** Map of providerId -> human name, threaded to `RunDetail` to label the picker. */
  readonly providerNames?: Readonly<Record<string, string>>
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
  onDeleteProject,
  onDeleteSession,
  onRename,
  models,
  providerNames,
}: {
  readonly selectedSessionId?: SessionId
  readonly projects: readonly ProjectSummary[]
  readonly sessionsByProject: Readonly<Record<string, readonly Session[]>>
  readonly collapsed: ReadonlySet<string>
  readonly onToggle: (projectId: string) => void
  readonly onSelect: (id: SessionId) => void
  readonly onMore: (projectId: string) => void
  readonly onNew: () => void
  readonly onDeleteProject: (projectId: string) => void
  readonly onDeleteSession: (sessionId: SessionId) => void
  readonly onRename?: ((id: SessionId, name: string) => void) | undefined
  readonly models?: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
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
      model: sessionModelLabel(
        s.modelId !== undefined ? String(s.modelId) : undefined,
        models ?? [],
        providerNames ?? {},
      ),
    })}
    onToggle={onToggle}
    onSelect={onSelect}
    onMore={onMore}
    onNew={onNew}
    onDeleteProject={onDeleteProject}
    onDeleteSession={onDeleteSession}
    onRename={onRename}
  />
)

/**
 * The sessions detail. Every session renders the native conversation
 * (`RunDetail`): an OPEN session connects the runner WS client live; a
 * selected-but-ended session folds its stored events read-only. Nothing
 * selected shows an empty state.
 */
const SessionsDetail = ({
  selectedSessionId,
  openSessionIds,
  allSessions,
  runnerClient,
  models,
  providerNames,
}: {
  readonly selectedSessionId?: SessionId
  readonly openSessionIds: readonly SessionId[]
  readonly allSessions: readonly Session[]
  readonly runnerClient: RunnerClient
  readonly models?: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
}): ReactElement => {
  if (selectedSessionId === undefined)
    return (
      <div className="lk-sessions-detail">
        <EmptyState
          title="No session selected"
          hint="Pick a session from the list, or start a new one."
        />
      </div>
    )

  const selectedSession = allSessions.find((s) => s.id === selectedSessionId)
  const isOpen = openSessionIds.includes(selectedSessionId)

  return (
    <div className="lk-sessions-detail">
      <RunDetail
        key={selectedSessionId}
        mode={isOpen ? "live" : "replay"}
        sessionId={selectedSession?.id ?? selectedSessionId}
        {...(selectedSession?.harnessId === undefined
          ? {}
          : { harnessId: selectedSession.harnessId })}
        runnerClient={runnerClient}
        {...(models === undefined ? {} : { models })}
        {...(providerNames === undefined ? {} : { providerNames })}
      />
    </div>
  )
}

/**
 * Sessions master/detail factory for `AppShell`. The shell (`app.tsx`) owns the
 * selection + open-set state, the project/session list (via `useProjects`), and the
 * launch/exit flow; this view wires the dumb `ProjectList` and the native run
 * detail from the props it is handed.
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
  onDeleteProject,
  onDeleteSession,
  onRename,
  runnerClient,
  models,
  providerNames,
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
      onDeleteProject={onDeleteProject}
      onDeleteSession={onDeleteSession}
      onRename={onRename}
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
    />
  ),
  detail: (
    <SessionsDetail
      {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
      openSessionIds={openSessionIds}
      allSessions={allSessions}
      runnerClient={runnerClient}
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
    />
  ),
})
