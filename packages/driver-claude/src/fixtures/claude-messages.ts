import type {
  SdkAssistantMessage,
  SdkResultMessage,
  SdkSystemInit,
  SdkUserMessage,
} from "../sdk-types"

export const systemInit: SdkSystemInit = {
  type: "system",
  subtype: "init",
  model: "claude-sonnet-4-6",
  session_id: "sess_1",
}

export const assistantText: SdkAssistantMessage = {
  type: "assistant",
  parent_tool_use_id: null,
  message: { content: [{ type: "text", text: "Hello there" }] },
}

export const assistantToolUse: SdkAssistantMessage = {
  type: "assistant",
  parent_tool_use_id: null,
  message: {
    content: [
      {
        type: "tool_use",
        id: "toolu_read",
        name: "Read",
        input: { path: "a.ts" },
      },
    ],
  },
}

// The sub-agent spawn: current SDKs emit "Agent" in tool_use blocks.
export const assistantAgentSpawn: SdkAssistantMessage = {
  type: "assistant",
  parent_tool_use_id: null,
  message: {
    content: [
      {
        type: "tool_use",
        id: "toolu_agent",
        name: "Agent",
        input: { subagent_type: "code-reviewer", prompt: "review" },
      },
    ],
  },
}

// Older SDKs emit "Task" for the same thing — the mapper must treat it identically.
export const assistantTaskSpawn: SdkAssistantMessage = {
  type: "assistant",
  parent_tool_use_id: null,
  message: {
    content: [
      {
        type: "tool_use",
        id: "toolu_task",
        name: "Task",
        input: { subagent_type: "researcher", prompt: "dig" },
      },
    ],
  },
}

// A message produced inside the spawned sub-agent: parent_tool_use_id points at the spawn id.
export const subAgentText: SdkAssistantMessage = {
  type: "assistant",
  parent_tool_use_id: "toolu_agent",
  message: { content: [{ type: "text", text: "Reviewing…" }] },
}

export const toolResult: SdkUserMessage = {
  type: "user",
  parent_tool_use_id: null,
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_read",
        content: "file contents",
        is_error: false,
      },
    ],
  },
}

export const resultSuccess: SdkResultMessage = {
  type: "result",
  subtype: "success",
  is_error: false,
  total_cost_usd: 0.0123,
  usage: {
    input_tokens: 100,
    output_tokens: 42,
    cache_read_input_tokens: 10,
  },
}

export const resultError: SdkResultMessage = {
  type: "result",
  subtype: "error_during_execution",
  is_error: true,
  usage: { input_tokens: 5, output_tokens: 0 },
}
