import type { Session, SessionId } from "@spectrum/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { EmptyState } from "../molecules/EmptyState"
import { Stack } from "../primitives/Stack"
import { ProjectGroup } from "./ProjectGroup"

export type SessionLabel = {
  readonly harnessName: string
  readonly model: string
}

export type ProjectSummary = {
  readonly id: string
  readonly name: string
  readonly sessionCount: number
}

export type ProjectListProps = {
  /** Alphabetical projects (the page resolves ordering). */
  readonly projects: readonly ProjectSummary[]
  /** Loaded session pages keyed by project id (newest-first). */
  readonly sessionsByProject: Readonly<Record<string, readonly Session[]>>
  readonly collapsed: ReadonlySet<string>
  readonly selectedId?: SessionId
  readonly labelFor: (session: Session) => SessionLabel
  readonly onToggle: (projectId: string) => void
  readonly onSelect: (id: SessionId) => void
  readonly onMore: (projectId: string) => void
  readonly onNew: () => void
}

export const ProjectList = ({
  projects,
  sessionsByProject,
  collapsed,
  selectedId,
  labelFor,
  onToggle,
  onSelect,
  onMore,
  onNew,
}: ProjectListProps): ReactElement => (
  <Stack gap={4} minHeight0 className="lk-session-list">
    <Button onClick={() => onNew()}>+ New session</Button>
    {projects.length === 0 ? (
      <EmptyState
        title="No projects yet"
        hint="Start a new session in a folder to create your first project."
      />
    ) : (
      projects.map((p) => (
        <ProjectGroup
          key={p.id}
          name={p.name}
          sessionCount={p.sessionCount}
          sessions={sessionsByProject[p.id] ?? []}
          collapsed={collapsed.has(p.id)}
          {...(selectedId === undefined ? {} : { selectedId })}
          labelFor={labelFor}
          onToggle={() => onToggle(p.id)}
          onSelect={onSelect}
          onMore={() => onMore(p.id)}
        />
      ))
    )}
  </Stack>
)
