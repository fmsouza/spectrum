import type { TaskItem } from "@spectrum/agent-events"
import type { ReactElement } from "react"
import type { DotStatus } from "../atoms/StatusDot"
import { StatusDot } from "../atoms/StatusDot"

export type TaskRowProps = {
  readonly item: TaskItem
}

const dotFor = (status: TaskItem["status"]): DotStatus =>
  status === "completed" ? "on" : status === "in_progress" ? "active" : "off"

export const TaskRow = ({ item }: TaskRowProps): ReactElement => {
  // In-progress rows show the present-tense activeForm; otherwise the static title.
  const label = item.status === "in_progress" ? item.activeForm : item.content
  return (
    <div className="lk-task-row" data-status={item.status}>
      <StatusDot status={dotFor(item.status)} label={`task ${item.status}`} />
      <span className="lk-task-row__label">{label}</span>
    </div>
  )
}
