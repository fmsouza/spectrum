import type { RunnerId, RunnerState, TaskList } from "@spectrum/agent-events"
import { type ReactElement, useState } from "react"
import { SubRunnerPane } from "./SubRunnerPane"
import { TaskRail } from "./TaskRail"

export type RunSideRailProps = {
  /** Root runner's task list (when shown alone, no sub open). Undefined or empty = no list. */
  readonly rootTaskList?: TaskList
  /** The open sub-runner, when one is focused. */
  readonly subRunner?: RunnerState
  /** The focused sub-runner's own task list. Undefined = the sub has no tasks. */
  readonly subTaskList?: TaskList
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly subBreadcrumb: readonly string[]
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onCloseSub: () => void
}

export const RunSideRail = ({
  rootTaskList,
  subRunner,
  subTaskList,
  runners,
  subBreadcrumb,
  onOpenSubRunner,
  onCloseSub,
}: RunSideRailProps): ReactElement | null => {
  // Which segment is showing. Defaults to the sub-agent; the caller keys this component by the open
  // sub-runner id so a new sub re-mounts and resets here.
  const [segment, setSegment] = useState<"tasks" | "sub">("sub")

  // No sub open: the column is the root task rail, or nothing.
  if (subRunner === undefined) {
    if (rootTaskList === undefined) return null
    return (
      <aside className="lk-side-rail">
        <TaskRail taskList={rootTaskList} />
      </aside>
    )
  }

  // Sub open: segmented column. The Tasks tab follows the focused (sub) runner.
  const tasksAvailable = subTaskList !== undefined
  const showingTasks = segment === "tasks" && tasksAvailable
  return (
    <aside className="lk-side-rail" data-sub-open>
      <div className="lk-side-rail__seg" role="tablist" aria-label="Side panel">
        <button
          type="button"
          role="tab"
          className="lk-side-rail__tab"
          aria-selected={showingTasks}
          disabled={!tasksAvailable}
          onClick={() => setSegment("tasks")}
        >
          Tasks
        </button>
        <button
          type="button"
          role="tab"
          className="lk-side-rail__tab"
          aria-selected={!showingTasks}
          onClick={() => setSegment("sub")}
        >
          Sub-agent
        </button>
      </div>
      {showingTasks && subTaskList !== undefined ? (
        <TaskRail taskList={subTaskList} />
      ) : (
        <SubRunnerPane
          runner={subRunner}
          runners={runners}
          breadcrumb={subBreadcrumb}
          onOpenSubRunner={onOpenSubRunner}
          onClose={onCloseSub}
        />
      )}
    </aside>
  )
}
