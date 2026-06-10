import type { Json, ToolCallItem } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { StatusDot } from "../atoms/StatusDot"
import { ToolIcon } from "../atoms/ToolIcon"

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
  return (
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
        {summary === undefined ? null : (
          <span className="lk-tool-call__summary" title={summary}>
            {summary}
          </span>
        )}
        {item.exitCode === undefined ? null : (
          <span className="lk-tool-call__exit">{`exit ${item.exitCode}`}</span>
        )}
      </button>
      {expanded && item.output !== undefined ? (
        <pre className="lk-tool-call__output">{item.output}</pre>
      ) : null}
    </div>
  )
}
