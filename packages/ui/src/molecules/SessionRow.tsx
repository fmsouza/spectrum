import type { Session } from "@spectrum/types"
import { type ReactElement, useState } from "react"
import { Badge } from "../atoms/Badge"
import { TextInput } from "../atoms/TextInput"
import { Truncate } from "../primitives/Truncate"
import { relativeTime } from "./relativeTime"

export type SessionRowProps = {
  readonly session: Session
  readonly harnessName: string
  readonly model: string
  readonly selected: boolean
  readonly onSelect: () => void
  /** Right-click handler (e.g. open a context menu). Optional. */
  readonly onContextMenu?: (e: { clientX: number; clientY: number }) => void
  /** Inline rename handler. When provided, clicking the name enters edit mode. Optional. */
  readonly onRename?: (name: string) => void
}

export const SessionRow = ({
  session,
  harnessName,
  model,
  selected,
  onSelect,
  onContextMenu,
  onRename,
}: SessionRowProps): ReactElement => {
  const isRunning = session.endedAt === undefined
  const displayName = session.name ?? session.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName)

  const startEdit = (): void => {
    if (onRename === undefined) return
    setDraft(displayName)
    setEditing(true)
  }

  const commit = (): void => {
    if (!editing) return
    const trimmed = draft.trim()
    if (trimmed !== "" && trimmed !== displayName) onRename?.(trimmed)
    setEditing(false)
  }

  const cancel = (): void => {
    setEditing(false)
  }

  return (
    <button
      type="button"
      className="lk-session-row"
      aria-pressed={selected}
      data-selected={selected}
      onClick={() => onSelect()}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault()
              onContextMenu({ clientX: e.clientX, clientY: e.clientY })
            }
      }
    >
      <span className="lk-session-row__line">
        {editing ? (
          <TextInput
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commit()
              } else if (e.key === "Escape") {
                e.preventDefault()
                cancel()
              }
            }}
            aria-label="Session name"
          />
        ) : onRename === undefined ? (
          <Truncate className="lk-session-row__name">{displayName}</Truncate>
        ) : (
          <span
            className="lk-session-row__name"
            onClick={(e) => {
              e.stopPropagation()
              startEdit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                startEdit()
              }
            }}
          >
            <Truncate>{displayName}</Truncate>
          </span>
        )}
        {isRunning ? (
          <Badge tone="info">running</Badge>
        ) : session.exitCode === undefined ? (
          <Badge tone="neutral">ended</Badge>
        ) : (
          <Badge tone={session.exitCode === 0 ? "success" : "danger"}>
            {`exit ${session.exitCode}`}
          </Badge>
        )}
      </span>
      <span className="lk-session-row__sub">{`${harnessName} · ${model}`}</span>
      <span className="lk-session-row__meta" data-testid="session-row-meta">
        {`${session.cwd ?? ""} · ${relativeTime(session.startedAt, Date.now())}`}
      </span>
    </button>
  )
}
