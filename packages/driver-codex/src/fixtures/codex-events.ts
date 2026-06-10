import type { CodexServerNotification } from "../protocol"

// --- Thread/turn lifecycle ---

export const threadStarted: CodexServerNotification = {
  method: "thread/started",
  params: { thread: { id: "th_1" } as never }, // only `thread.id` is read; cast the rest of Thread
}
export const turnStarted: CodexServerNotification = {
  method: "turn/started",
  params: {
    threadId: "th_1",
    turn: { id: "tn_1", items: [], status: "inProgress" } as never,
  },
}
export const tokenUsage: CodexServerNotification = {
  method: "thread/tokenUsage/updated",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    tokenUsage: {
      total: {
        totalTokens: 30,
        inputTokens: 20,
        cachedInputTokens: 5,
        outputTokens: 10,
        reasoningOutputTokens: 0,
      },
      last: {
        totalTokens: 30,
        inputTokens: 20,
        cachedInputTokens: 5,
        outputTokens: 10,
        reasoningOutputTokens: 0,
      },
      modelContextWindow: 200000,
    },
  },
}
export const turnCompleted: CodexServerNotification = {
  method: "turn/completed",
  params: {
    threadId: "th_1",
    turn: { id: "tn_1", items: [], status: "completed", error: null } as never,
  },
}
export const turnFailed: CodexServerNotification = {
  method: "turn/completed",
  params: {
    threadId: "th_1",
    turn: {
      id: "tn_1",
      items: [],
      status: "failed",
      error: { message: "boom", codexErrorInfo: null, additionalDetails: null },
    } as never,
  },
}
export const turnInterrupted: CodexServerNotification = {
  method: "turn/completed",
  params: {
    threadId: "th_1",
    turn: {
      id: "tn_1",
      items: [],
      status: "interrupted",
      error: null,
    } as never,
  },
}
export const errorRetryable: CodexServerNotification = {
  method: "error",
  params: {
    error: {
      message: "transient",
      codexErrorInfo: null,
      additionalDetails: null,
    },
    willRetry: true,
    threadId: "th_1",
    turnId: "tn_1",
  },
}
export const errorFatal: CodexServerNotification = {
  method: "error",
  params: {
    error: { message: "fatal", codexErrorInfo: null, additionalDetails: null },
    willRetry: false,
    threadId: "th_1",
    turnId: "tn_1",
  },
}

// --- Agent message + reasoning deltas ---

export const agentMsgStarted: CodexServerNotification = {
  method: "item/started",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    startedAtMs: 1,
    item: {
      type: "agentMessage",
      id: "it_msg",
      text: "",
      phase: null,
      memoryCitation: null,
    } as never,
  },
}
export const agentMsgDelta: CodexServerNotification = {
  method: "item/agentMessage/delta",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    itemId: "it_msg",
    delta: "Hello",
  },
}
export const reasoningDelta: CodexServerNotification = {
  method: "item/reasoning/textDelta",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    itemId: "it_rsn",
    delta: "thinking",
    contentIndex: 0,
  },
}
export const reasoningSummaryDelta: CodexServerNotification = {
  method: "item/reasoning/summaryTextDelta",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    itemId: "it_rsn",
    delta: "summary",
    summaryIndex: 0,
  } as never,
}

// --- Command execution + file changes ---

export const cmdStarted: CodexServerNotification = {
  method: "item/started",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    startedAtMs: 1,
    item: {
      type: "commandExecution",
      id: "it_cmd",
      command: "ls -la",
      cwd: "/repo" as never,
      processId: null,
      source: "agent",
      status: "inProgress",
      commandActions: [],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    } as never,
  },
}
export const cmdOutput: CodexServerNotification = {
  method: "item/commandExecution/outputDelta",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    itemId: "it_cmd",
    delta: "total 8\n",
  },
}
export const cmdCompleted: CodexServerNotification = {
  method: "item/completed",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    completedAtMs: 9,
    item: {
      type: "commandExecution",
      id: "it_cmd",
      command: "ls -la",
      cwd: "/repo" as never,
      processId: null,
      source: "agent",
      status: "completed",
      commandActions: [],
      aggregatedOutput: "total 8\n",
      exitCode: 0,
      durationMs: 12,
    } as never,
  },
}
export const cmdFailed: CodexServerNotification = {
  method: "item/completed",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    completedAtMs: 9,
    item: {
      type: "commandExecution",
      id: "it_cmd2",
      command: "false",
      cwd: "/repo" as never,
      processId: null,
      source: "agent",
      status: "failed",
      commandActions: [],
      aggregatedOutput: "",
      exitCode: 1,
      durationMs: 3,
    } as never,
  },
}
export const fileChange: CodexServerNotification = {
  method: "item/completed",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    completedAtMs: 9,
    item: {
      type: "fileChange",
      id: "it_fc",
      status: "completed" as never,
      changes: [
        {
          path: "src/a.ts",
          kind: { type: "update", move_path: null },
          diff: "@@ -1 +1 @@",
        },
        { path: "src/new.ts", kind: { type: "add" }, diff: "+new" },
      ],
    } as never,
  },
}

// --- Collab sub-agents ---

export const collabSpawn: CodexServerNotification = {
  method: "item/started",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    startedAtMs: 1,
    item: {
      type: "collabAgentToolCall",
      id: "it_collab",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "th_1",
      receiverThreadIds: ["th_child"],
      prompt: "do x",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as never,
  },
}

/** A `turn/completed` attributed to the spawned child thread (proves thread→runner correlation). */
export const childTurnCompleted: CodexServerNotification = {
  method: "turn/completed",
  params: {
    threadId: "th_child",
    turn: { id: "tn_c", items: [], status: "completed", error: null } as never,
  },
}

/** An unknown/defensively-handled item type in item/started (app-server is experimental). */
export const unknownItemStarted: CodexServerNotification = {
  method: "item/started",
  params: {
    threadId: "th_1",
    turnId: "tn_1",
    startedAtMs: 1,
    item: { type: "webSearch", id: "it_ws", query: "x", action: null } as never,
  },
}
