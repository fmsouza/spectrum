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
  /** When true the column is reduced to a thin strip with an expand control. Default false. */
  readonly collapsed?: boolean
  /** Toggle the collapsed state. Required for the collapse/expand controls to do anything. */
  readonly onToggleCollapsed?: () => void
  /** Open a chat link in the OS browser; threaded to the sub-runner pane's timeline. */
  readonly onOpenLink?: (url: string) => void
}

export const RunSideRail = ({
  rootTaskList,
  subRunner,
  subTaskList,
  runners,
  subBreadcrumb,
  onOpenSubRunner,
  onCloseSub,
  collapsed = false,
  onToggleCollapsed = () => {},
  onOpenLink,
}: RunSideRailProps): ReactElement | null => {
  // Which segment is showing. Defaults to the sub-agent; the caller keys this component by the open
  // sub-runner id so a new sub re-mounts and resets here.
  const [segment, setSegment] = useState<"tasks" | "sub">("sub")

  // Availability: which segments have content to show. Same rule for the vertical
  // buttons (collapsed) and the tab buttons (expanded).
  const tasksAvailable =
    (subRunner !== undefined ? subTaskList : rootTaskList) !== undefined
  const subAvailable = subRunner !== undefined

  // Collapsed: a thin vertical strip with an expand control and vertical
  // Tasks/Sub-agent buttons (disabled when their content is empty). Always
  // renders — even when both are empty — so the rail never disappears.
  if (collapsed) {
    const countList = subRunner !== undefined ? subTaskList : rootTaskList
    return (
      <aside className="lk-side-rail lk-side-rail--collapsed">
        <button
          type="button"
          className="lk-side-rail__expand"
          aria-label="Expand tasks panel"
          onClick={() => onToggleCollapsed()}
        >
          ‹
        </button>
        <button
          type="button"
          className="lk-side-rail__vtab"
          aria-label="Tasks"
          disabled={!tasksAvailable}
          onClick={() => {
            setSegment("tasks")
            onToggleCollapsed()
          }}
        >
          Tasks
        </button>
        <button
          type="button"
          className="lk-side-rail__vtab"
          aria-label="Sub-agent"
          disabled={!subAvailable}
          onClick={() => {
            setSegment("sub")
            onToggleCollapsed()
          }}
        >
          Sub-agent
        </button>
        {countList === undefined ? null : (
          <span className="lk-side-rail__collapsed-count">
            {countList.completed}/{countList.total}
          </span>
        )}
      </aside>
    )
  }

  // No sub open: the column is the root task rail.
  if (subRunner === undefined) {
    if (rootTaskList === undefined) return null
    return (
      <aside className="lk-side-rail">
        <TaskRail taskList={rootTaskList} onCollapse={onToggleCollapsed} />
      </aside>
    )
  }

  // Sub open: segmented column. The Tasks tab follows the focused (sub) runner.
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
        <button
          type="button"
          className="lk-side-rail__collapse"
          aria-label="Collapse tasks panel"
          onClick={() => onToggleCollapsed()}
        >
          ›
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
          {...(onOpenLink === undefined ? {} : { onOpenLink })}
        />
      )}
    </aside>
  )
}
