import type {
  ApprovalDecision,
  RunnerId,
  RunnerState,
} from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { Composer } from "../molecules/Composer"
import { ConversationTimeline } from "./ConversationTimeline"
import { SubRunnerPane } from "./SubRunnerPane"

export type RunViewProps = {
  readonly root: RunnerState
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly openRunner?: RunnerState
  readonly subBreadcrumb: readonly string[]
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onCloseSub: () => void
  readonly onSend: (text: string) => void
  readonly onDecide: (requestId: string, decision: ApprovalDecision) => void
  readonly inert?: boolean
}

export const RunView = ({
  root,
  runners,
  openRunner,
  subBreadcrumb,
  onOpenSubRunner,
  onCloseSub,
  onSend,
  onDecide,
  inert = false,
}: RunViewProps): ReactElement => (
  <div className="lk-run-view" data-sub-open={openRunner !== undefined}>
    <section className="lk-run-view__main">
      <div className="lk-run-view__scroll">
        <ConversationTimeline
          runner={root}
          runners={runners}
          onOpenSubRunner={onOpenSubRunner}
          onDecide={onDecide}
          inert={inert}
        />
      </div>
      <Composer onSend={onSend} disabled={inert} />
    </section>
    {openRunner === undefined ? null : (
      <SubRunnerPane
        runner={openRunner}
        runners={runners}
        breadcrumb={subBreadcrumb}
        onOpenSubRunner={onOpenSubRunner}
        onClose={onCloseSub}
      />
    )}
  </div>
)
