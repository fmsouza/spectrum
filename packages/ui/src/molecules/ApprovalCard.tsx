import type { ApprovalDecision, ApprovalItem } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"

export type ApprovalCardProps = {
  readonly item: ApprovalItem
  readonly onDecide: (decision: ApprovalDecision) => void
  /** Replay/read-only: render the buttons disabled. */
  readonly inert?: boolean
}

export const ApprovalCard = ({
  item,
  onDecide,
  inert = false,
}: ApprovalCardProps): ReactElement => (
  <div className="lk-approval" data-kind={item.target.kind}>
    <div className="lk-approval__title">{`Approve ${item.target.kind}`}</div>
    <code className="lk-approval__detail">{item.target.detail}</code>
    {item.decision === undefined ? (
      <div className="lk-approval__actions">
        <Button variant="primary" disabled={inert} onClick={() => onDecide("allow")}>
          Approve
        </Button>
        <Button variant="secondary" disabled={inert} onClick={() => onDecide("deny")}>
          Deny
        </Button>
        <Button variant="secondary" disabled={inert} onClick={() => onDecide("allow-always")}>
          Always
        </Button>
      </div>
    ) : (
      <div className="lk-approval__resolved" data-decision={item.decision}>
        {`${item.decision} · ${item.by ?? "user"}`}
      </div>
    )}
  </div>
)
