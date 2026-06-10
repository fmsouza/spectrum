import type { RunnerId, RunnerState } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { ConversationTimeline } from "./ConversationTimeline"

export type SubRunnerPaneProps = {
  readonly runner: RunnerState
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly breadcrumb: readonly string[]
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onClose: () => void
}

export const SubRunnerPane = ({
  runner,
  runners,
  breadcrumb,
  onOpenSubRunner,
  onClose,
}: SubRunnerPaneProps): ReactElement => (
  <aside className="lk-sub-runner-pane" data-runner={runner.id}>
    <header className="lk-sub-runner-pane__head">
      <nav className="lk-sub-runner-pane__crumb" aria-label="Sub-runner path">
        {breadcrumb.join(" / ")}
      </nav>
      <span className="lk-sub-runner-pane__readonly">Read-only</span>
      <button
        type="button"
        className="lk-sub-runner-pane__close"
        aria-label="Close sub-runner"
        onClick={() => onClose()}
      >
        ✕
      </button>
    </header>
    <div className="lk-sub-runner-pane__body">
      <ConversationTimeline
        runner={runner}
        runners={runners}
        onOpenSubRunner={onOpenSubRunner}
        onDecide={() => {}}
        inert
      />
    </div>
  </aside>
)
