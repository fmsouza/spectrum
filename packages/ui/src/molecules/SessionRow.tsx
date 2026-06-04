import type { Session } from "@launchkit/types"
import type { ReactElement } from "react"
import { Badge } from "../atoms/Badge"
import { StatusDot } from "../atoms/StatusDot"
import { relativeTime } from "./relativeTime"

export type SessionRowProps = {
  readonly session: Session
  readonly harnessName: string
  readonly model: string
  readonly selected: boolean
  readonly onSelect: () => void
}

export const SessionRow = ({
  session,
  harnessName,
  model,
  selected,
  onSelect,
}: SessionRowProps): ReactElement => {
  const isRunning = session.endedAt === undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      onClick={() => onSelect()}
    >
      <span>
        <StatusDot status={isRunning ? "on" : "off"} label="session status" />
        <span>{session.name ?? session.id}</span>
        {isRunning ? (
          <Badge tone="info">running</Badge>
        ) : (
          <Badge tone={session.exitCode === 0 ? "success" : "danger"}>
            {`exit ${session.exitCode ?? "?"}`}
          </Badge>
        )}
      </span>
      <span>{`${harnessName} · ${model}`}</span>
      <span data-testid="session-row-meta">
        {`${session.cwd ?? ""} · ${relativeTime(session.startedAt, Date.now())}`}
      </span>
    </button>
  )
}
