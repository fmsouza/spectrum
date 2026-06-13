import type { RunnerId, RunnerStatus } from "@spectrum/agent-events"
import type { ReactElement } from "react"
import { StatusDot } from "../atoms/StatusDot"

export type SubRunnerCardProps = {
  readonly runnerId: RunnerId
  readonly title: string
  readonly status: RunnerStatus
  readonly onOpen: (id: RunnerId) => void
}

export const SubRunnerCard = ({
  runnerId,
  title,
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
    <span className="lk-sub-runner-card__open" aria-hidden>
      Open ▸
    </span>
  </button>
)
