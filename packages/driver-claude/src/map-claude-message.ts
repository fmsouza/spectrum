import type { CanonicalEvent, RunnerId, Usage } from "@launchkit/agent-events"
import type {
  SdkAssistantMessage,
  SdkContentBlock,
  SdkMessageLike,
  SdkResultMessage,
  SdkSystemInit,
  SdkTextBlock,
  SdkToolResultBlock,
  SdkToolUseBlock,
  SdkUserMessage,
} from "./sdk-types"

/** The tool names Claude uses to spawn a sub-agent ("Task" pre-CLI-2.1.63, "Agent" after). */
const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"])

/**
 * Small mutable mapping state threaded across messages. `newRunnerId` mints a child runner id (the
 * runtime supplies `ctx.newRunnerId`); `childByToolUseId` records which child a sub-agent's
 * `parent_tool_use_id` resolves to; `nextMessageId` makes each assistant turn's text accumulate under
 * a stable id within the same SDK message.
 */
export interface ClaudeMapState {
  readonly rootRunnerId: RunnerId
  newRunnerId: () => RunnerId
  readonly childByToolUseId: Map<string, RunnerId>
  seq: number
}

export const initialClaudeMapState = (
  rootRunnerId: RunnerId,
): ClaudeMapState => ({
  rootRunnerId,
  newRunnerId: () => rootRunnerId, // overridden by the glue with ctx.newRunnerId
  childByToolUseId: new Map(),
  seq: 0,
})

/** Resolve which runner a message belongs to from its parent_tool_use_id. */
const runnerFor = (
  state: ClaudeMapState,
  parentToolUseId: string | null,
): RunnerId => {
  if (parentToolUseId === null) return state.rootRunnerId
  return state.childByToolUseId.get(parentToolUseId) ?? state.rootRunnerId
}

const nextMessageId = (state: ClaudeMapState): string => {
  state.seq += 1
  return `m_${state.seq}`
}

const isTextBlock = (b: SdkContentBlock): b is SdkTextBlock => b.type === "text"
const isToolUse = (b: SdkContentBlock): b is SdkToolUseBlock =>
  b.type === "tool_use"
const isToolResult = (b: SdkContentBlock): b is SdkToolResultBlock =>
  b.type === "tool_result"

const toolResultText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content))
    return content
      .map((p) =>
        typeof p === "object" && p !== null && "text" in p
          ? String((p as { text: unknown }).text)
          : "",
      )
      .join("")
  return ""
}

const mapAssistant = (
  msg: SdkAssistantMessage,
  state: ClaudeMapState,
): CanonicalEvent[] => {
  const runnerId = runnerFor(state, msg.parent_tool_use_id)
  const events: CanonicalEvent[] = []
  for (const block of msg.message.content) {
    if (isTextBlock(block)) {
      events.push({
        type: "text-delta",
        runnerId,
        messageId: nextMessageId(state),
        text: block.text,
      })
      continue
    }
    if (isToolUse(block)) {
      events.push({
        type: "tool-call-started",
        runnerId,
        callId: block.id,
        tool: block.name,
        ...(block.input !== undefined ? { input: block.input } : {}),
      })
      if (SUBAGENT_TOOLS.has(block.name)) {
        const child = state.newRunnerId()
        state.childByToolUseId.set(block.id, child)
        const agentType =
          typeof block.input === "object" &&
          block.input !== null &&
          "subagent_type" in block.input
            ? String((block.input as { subagent_type: unknown }).subagent_type)
            : undefined
        events.push({
          type: "runner-started",
          runnerId: child,
          parentRunnerId: runnerId,
          spawnedByCallId: block.id,
          ...(agentType !== undefined ? { agentType } : {}),
        })
      }
    }
  }
  return events
}

const mapUser = (
  msg: SdkUserMessage,
  state: ClaudeMapState,
): CanonicalEvent[] => {
  if (typeof msg.message.content === "string") return []
  const runnerId = runnerFor(state, msg.parent_tool_use_id)
  const events: CanonicalEvent[] = []
  for (const block of msg.message.content) {
    if (isToolResult(block)) {
      events.push({
        type: "tool-call-finished",
        runnerId,
        callId: block.tool_use_id,
        status: block.is_error === true ? "error" : "ok",
        output: toolResultText(block.content),
      })
    }
  }
  return events
}

const mapResultUsage = (msg: SdkResultMessage): Usage => ({
  inputTokens: msg.usage?.input_tokens ?? 0,
  outputTokens: msg.usage?.output_tokens ?? 0,
  ...(msg.usage?.cache_read_input_tokens !== undefined
    ? { cachedInputTokens: msg.usage.cache_read_input_tokens }
    : {}),
  ...(msg.total_cost_usd !== undefined ? { costUsd: msg.total_cost_usd } : {}),
})

const mapResult = (
  msg: SdkResultMessage,
  state: ClaudeMapState,
): CanonicalEvent[] => [
  { type: "usage", runnerId: state.rootRunnerId, usage: mapResultUsage(msg) },
  {
    type: "runner-finished",
    runnerId: state.rootRunnerId,
    status: msg.is_error ? "errored" : "completed",
  },
]

/**
 * PURE: map one SDK message → 0..n canonical events, mutating the small `state` for runner
 * correlation + message-id sequencing. The live glue calls this for every message the `query()`
 * async iterator yields and `ctx.emit`s each result.
 */
export const mapClaudeMessage = (
  msg: SdkMessageLike,
  state: ClaudeMapState,
): readonly CanonicalEvent[] => {
  switch (msg.type) {
    case "system":
      return (msg as SdkSystemInit).subtype === "init"
        ? [
            {
              type: "runner-started",
              runnerId: state.rootRunnerId,
              model: (msg as SdkSystemInit).model,
            },
          ]
        : []
    case "assistant":
      return mapAssistant(msg as SdkAssistantMessage, state)
    case "user":
      return mapUser(msg as SdkUserMessage, state)
    case "result":
      return mapResult(msg as SdkResultMessage, state)
    default:
      return []
  }
}
