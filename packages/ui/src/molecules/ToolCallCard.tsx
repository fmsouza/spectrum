import type { ToolCallItem } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { StatusDot } from "../atoms/StatusDot"
import { ToolIcon } from "../atoms/ToolIcon"

export type ToolCallCardProps = {
  readonly item: ToolCallItem
  readonly expanded: boolean
  readonly onToggle: () => void
}

export const ToolCallCard = ({
  item,
  expanded,
  onToggle,
}: ToolCallCardProps): ReactElement => (
  <div
    className="lk-tool-call"
    data-testid={`tool-call-${item.callId}`}
    data-status={item.status}
  >
    <button
      type="button"
      className="lk-tool-call__header"
      aria-expanded={expanded}
      onClick={() => onToggle()}
    >
      <StatusDot
        status={item.status === "running" ? "off" : "on"}
        label={`tool ${item.status}`}
      />
      <ToolIcon tool={item.tool} />
      <span className="lk-tool-call__name">{item.tool}</span>
      {item.exitCode === undefined ? null : (
        <span className="lk-tool-call__exit">{`exit ${item.exitCode}`}</span>
      )}
    </button>
    {expanded && item.output !== undefined ? (
      <pre className="lk-tool-call__output">{item.output}</pre>
    ) : null}
  </div>
)
