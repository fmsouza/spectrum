import type { Session, SessionId } from "@spectrum/types"
import { type ReactElement, useState } from "react"
import { Button } from "../atoms/Button"
import { ConfirmDialog } from "../molecules/ConfirmDialog"
import { ContextMenu } from "../molecules/ContextMenu"
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
  /** Delete an entire project (and its sessions). Optional — enables the project context menu. */
  readonly onDeleteProject?: (projectId: string) => void
  /** Delete a single session. Optional — enables the session context menu. */
  readonly onDeleteSession?: (sessionId: SessionId) => void
}

type Menu =
  | {
      readonly kind: "project"
      readonly id: string
      readonly x: number
      readonly y: number
    }
  | {
      readonly kind: "session"
      readonly id: SessionId
      readonly x: number
      readonly y: number
    }

type Pending =
  | { readonly kind: "project"; readonly id: string; readonly name: string }
  | { readonly kind: "session"; readonly id: SessionId }

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
  onDeleteProject,
  onDeleteSession,
}: ProjectListProps): ReactElement => {
  const [menu, setMenu] = useState<Menu | undefined>(undefined)
  const [pending, setPending] = useState<Pending | undefined>(undefined)

  return (
    <>
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
              {...(onDeleteProject === undefined
                ? {}
                : {
                    onContextMenu: (e) =>
                      setMenu({
                        kind: "project",
                        id: p.id,
                        x: e.clientX,
                        y: e.clientY,
                      }),
                  })}
              {...(onDeleteSession === undefined
                ? {}
                : {
                    onSessionContextMenu: (id, e) =>
                      setMenu({
                        kind: "session",
                        id,
                        x: e.clientX,
                        y: e.clientY,
                      }),
                  })}
            />
          ))
        )}
      </Stack>
      {menu !== undefined ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={[
            menu.kind === "project"
              ? {
                  label: "Delete project",
                  danger: true,
                  onSelect: () => {
                    const name =
                      projects.find((pr) => pr.id === menu.id)?.name ?? menu.id
                    setPending({ kind: "project", id: menu.id, name })
                  },
                }
              : {
                  label: "Delete session",
                  danger: true,
                  onSelect: () => setPending({ kind: "session", id: menu.id }),
                },
          ]}
        />
      ) : null}
      {pending !== undefined ? (
        pending.kind === "project" ? (
          <ConfirmDialog
            open
            title="Delete project?"
            message={`Delete "${pending.name}" and all its sessions? This cannot be undone.`}
            confirmLabel="Delete project"
            onConfirm={() => {
              onDeleteProject?.(pending.id)
              setPending(undefined)
            }}
            onClose={() => setPending(undefined)}
          />
        ) : (
          <ConfirmDialog
            open
            title="Delete session?"
            message="Delete this session and its history? This cannot be undone."
            confirmLabel="Delete session"
            onConfirm={() => {
              onDeleteSession?.(pending.id)
              setPending(undefined)
            }}
            onClose={() => setPending(undefined)}
          />
        )
      ) : null}
    </>
  )
}
