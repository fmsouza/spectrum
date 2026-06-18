import type { RunnerId, RunnerStatus } from "@spectrum/agent-events"
import type { ReactElement } from "react"
import { StatusDot } from "../atoms/StatusDot"

export type SubRunnerCardProps = {
  readonly runnerId: RunnerId
  readonly title: string
  /** A short hint of what the sub-agent is doing, shown beside the title. */
  readonly detail?: string
  readonly status: RunnerStatus
  readonly onOpen: (id: RunnerId) => void
}

export const SubRunnerCard = ({
  runnerId,
  title,
  detail,
  status,
  onOpen,
}: SubRunnerCardProps): ReactElement => (
  <button
    type="button"
    className="lk-sub-runner-card"
    data-status={status}
    onClick={() => onOpen(runnerId)}
  >
    <StatusDot
      status={status === "running" ? "off" : "on"}
      label={`sub-runner ${status}`}
    />
    <span className="lk-sub-runner-card__title">{title}</span>
    {detail === undefined ? null : (
      <span className="lk-sub-runner-card__detail" title={detail}>
        {detail}
      </span>
    )}
    <span className="lk-sub-runner-card__open" aria-hidden>
      Open ▸
    </span>
  </button>
)
