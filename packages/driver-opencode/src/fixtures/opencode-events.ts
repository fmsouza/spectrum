import type { OpencodeEvent } from "../transport"

// Recorded against the documented SSE bus (opencode.ai/docs/server + sdk types.gen.ts).
// Every part carries sessionID/messageID/id; child sessions carry parentID.
export const S_ROOT = "ses_root"
export const S_CHILD = "ses_child"

export const messageUpdatedFixture: OpencodeEvent = {
  type: "message.updated",
  properties: { info: { id: "msg_1", sessionID: S_ROOT, role: "assistant" } },
}

export const textPartFixture: OpencodeEvent = {
  type: "message.part.updated",
  properties: {
    part: {
      id: "prt_1",
      sessionID: S_ROOT,
      messageID: "msg_1",
      type: "text",
      text: "Hello",
    },
  },
}

export const toolPartSequenceFixture = [
  {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_2",
        sessionID: S_ROOT,
        messageID: "msg_1",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: { status: "pending", input: { command: "ls" } },
      },
    },
  },
  {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_2",
        sessionID: S_ROOT,
        messageID: "msg_1",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "running",
          input: { command: "ls" },
          title: "ls",
          time: { start: 1 },
        },
      },
    },
  },
  {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_2",
        sessionID: S_ROOT,
        messageID: "msg_1",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls" },
          output: "file-a\n",
          title: "ls",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      },
    },
  },
] satisfies readonly OpencodeEvent[]

export const toolPartErrorFixture: OpencodeEvent = {
  type: "message.part.updated",
  properties: {
    part: {
      id: "prt_3",
      sessionID: S_ROOT,
      messageID: "msg_1",
      type: "tool",
      callID: "call_2",
      tool: "bash",
      state: {
        status: "error",
        input: { command: "nope" },
        error: "exit 1",
        time: { start: 1, end: 2 },
      },
    },
  },
}

export const permissionUpdatedFixture: OpencodeEvent = {
  type: "permission.updated",
  properties: {
    id: "perm_1",
    type: "bash",
    sessionID: S_ROOT,
    messageID: "msg_1",
    callID: "call_1",
    pattern: "rm -rf build",
    title: "Run rm -rf build",
    metadata: {},
    time: { created: 1 },
  },
}

// Subagent run: a child session created with parentID; the spawning Task tool call is the correlation.
export const childSessionCreatedFixture: OpencodeEvent = {
  type: "session.updated",
  properties: {
    info: { id: S_CHILD, parentID: S_ROOT, title: "explore the codebase" },
  },
}

export const childTextPartFixture: OpencodeEvent = {
  type: "message.part.updated",
  properties: {
    part: {
      id: "prt_c1",
      sessionID: S_CHILD,
      messageID: "msg_c1",
      type: "text",
      text: "searching",
    },
  },
}

// An out-of-scope event for a different session (must be filtered out by the adapter).
export const otherSessionTextFixture: OpencodeEvent = {
  type: "message.part.updated",
  properties: {
    part: {
      id: "prt_x",
      sessionID: "ses_other",
      messageID: "msg_x",
      type: "text",
      text: "not mine",
    },
  },
}

export const sessionIdleFixture: OpencodeEvent = {
  type: "session.idle",
  properties: { sessionID: S_ROOT },
}

export const sessionErrorFixture: OpencodeEvent = {
  type: "session.error",
  properties: {
    info: { id: S_ROOT, parentID: undefined },
    error: { name: "ProviderError", data: { message: "boom" } },
  },
}

// A root-session (parentID undefined) title update. Today the mapper drops this; the
// naming plan routes it to a root runner-started re-emit so the RunManager can name the session.
export const rootSessionTitleFixture: OpencodeEvent = {
  type: "session.updated",
  properties: { info: { id: S_ROOT, parentID: undefined, title: "Root title" } },
}

// A root-session update WITHOUT a title — must NOT emit a no-op re-emit.
export const rootSessionNoTitleFixture: OpencodeEvent = {
  type: "session.updated",
  properties: { info: { id: S_ROOT, parentID: undefined } },
}
