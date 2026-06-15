import type { Session } from "@spectrum/types"
import type { ReactElement } from "react"
import { Badge } from "../atoms/Badge"
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
}

export const SessionRow = ({
  session,
  harnessName,
  model,
  selected,
  onSelect,
  onContextMenu,
}: SessionRowProps): ReactElement => {
  const isRunning = session.endedAt === undefined
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
        <Truncate className="lk-session-row__name">
          {session.name ?? session.id}
        </Truncate>
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
