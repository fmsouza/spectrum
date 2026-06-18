import type { Json, ToolCallItem } from "@spectrum/agent-events"
import type { ReactElement } from "react"
import type { DotStatus } from "../atoms/StatusDot"
import { StatusDot } from "../atoms/StatusDot"

export type ToolCallCardProps = {
  readonly item: ToolCallItem
  readonly expanded: boolean
  readonly onToggle: () => void
}

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined

/**
 * The one-line inline detail shown next to the tool name: the shell command for Bash/shell, the path for
 * file ops, the skill/sub-agent name otherwise — pulled from the (harness-shaped) tool `input`. PURE.
 */
export const toolCallSummary = (
  input: Json | undefined,
): string | undefined => {
  if (input === null || input === undefined || typeof input !== "object")
    return undefined
  const o = input as Record<string, unknown>
  return (
    asString(o.command) ?? // Bash / shell / codex commandExecution / claude Skill
    asString(o.file_path) ?? // Edit / Write / Read
    asString(o.path) ??
    asString(o.skill) ?? // skill invocations
    asString(o.name) ?? // sub-agent / generic
    asString(o.description) ??
    asString(o.prompt) ??
    undefined
  )
}

export const ToolCallCard = ({
  item,
  expanded,
  onToggle,
}: ToolCallCardProps): ReactElement => {
  const summary = toolCallSummary(item.input)
  const hasDetails = item.output !== undefined
  const dot: DotStatus =
    item.status === "running" ? "off" : item.status === "error" ? "error" : "on"
  return (
    <div
      className="lk-tool-call"
      data-testid={`tool-call-${item.callId}`}
      data-status={item.status}
    >
      <button
        type="button"
        className="lk-tool-call__header"
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
        onClick={() => onToggle()}
      >
        <StatusDot status={dot} label={`tool ${item.status}`} />
        {hasDetails ? (
          <span className="lk-tool-call__chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span
            className="lk-tool-call__chevron lk-tool-call__chevron--spacer"
            aria-hidden="true"
          />
        )}
        <span className="lk-tool-call__name">{item.tool}</span>
        {summary === undefined ? null : (
          <span className="lk-tool-call__summary" title={summary}>
            {summary}
          </span>
        )}
        <span className="lk-tool-call__meta">
          {item.exitCode === undefined ? null : (
            <span className="lk-tool-call__exit">{`exit ${item.exitCode}`}</span>
          )}
        </span>
      </button>
      {expanded && hasDetails ? (
        <div className="lk-tool-call__details">
          <div className="lk-tool-call__details-meta">
            {item.exitCode === undefined
              ? "output"
              : `output · exit ${item.exitCode}`}
          </div>
          <pre className="lk-tool-call__output">{item.output}</pre>
        </div>
      ) : null}
    </div>
  )
}
