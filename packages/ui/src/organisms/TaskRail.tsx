import type { TaskList } from "@spectrum/agent-events"
import type { ReactElement } from "react"
import { TaskRow } from "../molecules/TaskRow"

export type TaskRailProps = {
  readonly taskList: TaskList
}

export const TaskRail = ({ taskList }: TaskRailProps): ReactElement => {
  const pct =
    taskList.total === 0
      ? 0
      : Math.round((taskList.completed / taskList.total) * 100)
  return (
    <div className="lk-task-rail">
      <header className="lk-task-rail__head">
        <span className="lk-task-rail__title">Tasks</span>
        <span className="lk-task-rail__count">
          {taskList.completed}/{taskList.total}
        </span>
      </header>
      {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar is a read-only range widget; screen readers expose it without a tab stop */}
      <div
        className="lk-task-rail__progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="lk-task-rail__rows">
        {taskList.items.map((item, i) => (
          <TaskRow key={`${i}-${item.content}`} item={item} />
        ))}
      </div>
    </div>
  )
}
