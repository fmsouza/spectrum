import { isTaskTool } from "@spectrum/agent-events"
import type {
  ApprovalDecision,
  RunnerId,
  RunnerState,
} from "@spectrum/agent-events"
import { type ReactElement, useState } from "react"
import { ApprovalCard } from "../molecules/ApprovalCard"
import { FileDiffCard } from "../molecules/FileDiffCard"
import { MessageBubble } from "../molecules/MessageBubble"
import { ReasoningBlock } from "../molecules/ReasoningBlock"
import { SubRunnerCard } from "../molecules/SubRunnerCard"
import { ToolCallCard } from "../molecules/ToolCallCard"
import { UsageFooter } from "../molecules/UsageFooter"
import { subAgentDetail } from "../molecules/subAgentDetail"

export type ConversationTimelineProps = {
  readonly runner: RunnerState
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onDecide: (requestId: string, decision: ApprovalDecision) => void
  readonly inert?: boolean
}

export const ConversationTimeline = ({
  runner,
  runners,
  onOpenSubRunner,
  onDecide,
  inert = false,
}: ConversationTimelineProps): ReactElement => {
  // Per-item expand state lives here (the page-level store holds RunState, not
  // ephemeral toggle bits): collapsed ids that the user has opened.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="lk-timeline" data-runner={runner.id}>
      {runner.items
        .filter((item) => !(item.kind === "tool-call" && isTaskTool(item.tool)))
        .map((item, i) => {
          switch (item.kind) {
            case "message":
              return (
                <MessageBubble
                  key={`m-${item.messageId}`}
                  text={item.text}
                  author={item.role}
                  {...(item.tone !== undefined ? { tone: item.tone } : {})}
                />
              )
            case "reasoning":
              return (
                <ReasoningBlock
                  key={`r-${item.messageId}`}
                  text={item.text}
                  expanded={expanded.has(item.messageId)}
                  onToggle={() => toggle(item.messageId)}
                />
              )
            case "tool-call": {
              if (item.spawnedRunnerId !== undefined) {
                const childRunner = runners.get(item.spawnedRunnerId)
                const detail = childRunner?.title ?? subAgentDetail(item.input)
                return (
                  <SubRunnerCard
                    key={`s-${item.callId}`}
                    runnerId={item.spawnedRunnerId}
                    title="Agent"
                    {...(detail === undefined ? {} : { detail })}
                    status={childRunner?.status ?? "running"}
                    onOpen={onOpenSubRunner}
                  />
                )
              }
              return (
                <ToolCallCard
                  key={`c-${item.callId}`}
                  item={item}
                  expanded={expanded.has(item.callId)}
                  onToggle={() => toggle(item.callId)}
                />
              )
            }
            case "file-change":
              return <FileDiffCard key={`f-${i}-${item.path}`} item={item} />
            case "approval":
              return (
                <ApprovalCard
                  key={`a-${item.requestId}`}
                  item={item}
                  inert={inert}
                  onDecide={(d) => onDecide(item.requestId, d)}
                />
              )
            default: {
              const _exhaustive: never = item
              return _exhaustive
            }
          }
        })}
      {runner.usage === undefined ? null : <UsageFooter usage={runner.usage} />}
    </div>
  )
}
