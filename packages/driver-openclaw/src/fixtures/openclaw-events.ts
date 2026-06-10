import type { OpenClawEvent } from "../transport"

// Recorded against the documented Gateway normalized envelope (docs.openclaw.ai/gateway/protocol).
// sessionKey is the Gateway run/session key; childSessionKey marks a sub-agent run.

export const runStartedFixture: OpenClawEvent = {
  type: "event",
  event: "run.started",
  payload: {
    sessionKey: "s-root",
    runId: "run-1",
    agentId: "default",
    model: "anthropic/claude-opus-4-6",
  },
  seq: 1,
}

export const assistantDeltaFixture: OpenClawEvent = {
  type: "event",
  event: "assistant.delta",
  payload: {
    sessionKey: "s-root",
    messageId: "m-1",
    deltaText: "Hello",
    message: "Hello",
  },
  seq: 2,
}

export const toolCallSequenceFixture: readonly OpenClawEvent[] = [
  {
    type: "event",
    event: "tool.call.started",
    payload: {
      sessionKey: "s-root",
      callId: "c-1",
      tool: "shell",
      input: { command: "ls" },
    },
    seq: 3,
  },
  {
    type: "event",
    event: "tool.call.delta",
    payload: { sessionKey: "s-root", callId: "c-1", chunk: "file-a\n" },
    seq: 4,
  },
  {
    type: "event",
    event: "tool.call.completed",
    payload: {
      sessionKey: "s-root",
      callId: "c-1",
      status: "ok",
      output: "file-a\n",
      exitCode: 0,
    },
    seq: 5,
  },
] as const

export const execApprovalRequestedFixture: OpenClawEvent = {
  type: "event",
  event: "exec.approval.requested",
  payload: {
    sessionKey: "s-root",
    approvalId: "a-1",
    kind: "command",
    detail: "rm -rf build",
  },
  seq: 6,
}

// Sub-agent: a child run announced via childSessionKey/parentTaskId, spawned by a parent tool call.
export const childRunStartedFixture: OpenClawEvent = {
  type: "event",
  event: "run.started",
  payload: {
    sessionKey: "s-child",
    runId: "run-2",
    childSessionKey: "s-child",
    parentSessionKey: "s-root",
    spawnedByCallId: "c-1",
    agentId: "researcher",
  },
  seq: 7,
}

export const usageFixture: OpenClawEvent = {
  type: "event",
  event: "usage",
  payload: {
    sessionKey: "s-root",
    inputTokens: 120,
    outputTokens: 48,
    costUsd: 0.0012,
  },
  seq: 8,
}

export const runCompletedFixture: OpenClawEvent = {
  type: "event",
  event: "run.completed",
  payload: { sessionKey: "s-root", runId: "run-1" },
  seq: 9,
}

export const runFailedFixture: OpenClawEvent = {
  type: "event",
  event: "run.failed",
  payload: { sessionKey: "s-root", runId: "run-1", error: "provider timeout" },
  seq: 9,
}
