import { describe, expect, it } from "bun:test"
import type { CanonicalEvent, RunnerId } from "@spectrum/agent-events"
import {
  assistantAgentSpawn,
  assistantTaskSpawn,
  assistantText,
  assistantToolUse,
  resultError,
  resultSuccess,
  subAgentText,
  systemInit,
  toolResult,
} from "./fixtures/claude-messages"
import {
  type ClaudeMapState,
  initialClaudeMapState,
  mapClaudeMessage,
} from "./map-claude-message"

const ROOT = "rnr_root" as RunnerId
const CHILD = "rnr_child" as RunnerId

// A deterministic mapping state: root runner known, child minted on demand from a fixed list.
const makeState = (): ClaudeMapState => ({
  ...initialClaudeMapState(ROOT),
  newRunnerId: () => CHILD,
})

describe("mapClaudeMessage", () => {
  it("maps system/init → runner-started for the root with the model", () => {
    const out = mapClaudeMessage(systemInit, makeState())
    expect(out).toEqual([
      { type: "runner-started", runnerId: ROOT, model: "claude-sonnet-4-6" },
    ])
  })

  it("maps assistant text → text-delta on the attributed runner", () => {
    const out = mapClaudeMessage(assistantText, makeState())
    expect(out).toEqual([
      {
        type: "text-delta",
        runnerId: ROOT,
        messageId: expect.any(String),
        text: "Hello there",
      },
    ])
  })

  it("maps a plain assistant tool_use → tool-call-started with its input", () => {
    const out = mapClaudeMessage(assistantToolUse, makeState())
    expect(out).toEqual([
      {
        type: "tool-call-started",
        runnerId: ROOT,
        callId: "toolu_read",
        tool: "Read",
        input: { path: "a.ts" },
      },
    ])
  })

  it("maps an Agent tool_use → tool-call-started PLUS a child runner-started (parent + spawnedByCallId)", () => {
    const out = mapClaudeMessage(assistantAgentSpawn, makeState())
    expect(out).toEqual([
      {
        type: "tool-call-started",
        runnerId: ROOT,
        callId: "toolu_agent",
        tool: "Agent",
        input: { subagent_type: "code-reviewer", prompt: "review" },
      },
      {
        type: "runner-started",
        runnerId: CHILD,
        parentRunnerId: ROOT,
        spawnedByCallId: "toolu_agent",
        agentType: "code-reviewer",
      },
    ])
  })

  it("treats a Task tool_use identically to Agent (older SDK naming)", () => {
    const out = mapClaudeMessage(assistantTaskSpawn, makeState())
    expect(out[1]).toEqual({
      type: "runner-started",
      runnerId: CHILD,
      parentRunnerId: ROOT,
      spawnedByCallId: "toolu_task",
      agentType: "researcher",
    })
  })

  it("attributes a sub-agent message to its child runner via parent_tool_use_id", () => {
    // First spawn so the state learns toolu_agent → CHILD, then map the sub-agent's text.
    const state = makeState()
    mapClaudeMessage(assistantAgentSpawn, state) // mutates state: records the child mapping
    const out = mapClaudeMessage(subAgentText, state)
    expect(out).toEqual([
      {
        type: "text-delta",
        runnerId: CHILD,
        messageId: expect.any(String),
        text: "Reviewing…",
      },
    ])
  })

  it("maps a user tool_result → tool-call-finished (status ok) by tool_use_id", () => {
    const out = mapClaudeMessage(toolResult, makeState())
    expect(out).toEqual([
      {
        type: "tool-call-finished",
        runnerId: ROOT,
        callId: "toolu_read",
        status: "ok",
        output: "file contents",
      },
    ])
  })

  it("maps a success result → usage then turn-finished on the root (the session stays alive)", () => {
    const out = mapClaudeMessage(resultSuccess, makeState())
    expect(out).toEqual([
      {
        type: "usage",
        runnerId: ROOT,
        usage: {
          inputTokens: 100,
          outputTokens: 42,
          cachedInputTokens: 10,
          costUsd: 0.0123,
        },
      },
      { type: "turn-finished", runnerId: ROOT },
    ])
  })

  it("maps an error result → turn-finished with an error, NOT runner-finished (the session stays alive)", () => {
    const out = mapClaudeMessage(resultError, makeState())
    expect(out.find((e) => e.type === "runner-finished")).toBeUndefined()
    expect(out.at(-1)).toEqual({
      type: "turn-finished",
      runnerId: ROOT,
      error: { detail: "Turn failed (error_during_execution)" },
    })
  })

  it("correlates an error result with the turn's last root assistant message (the streamed error text)", () => {
    // Claude streams the API error text as a normal assistant message, THEN flags the turn
    // via result.is_error — the mapper must point the turn error at that message so the UI
    // can restyle the existing bubble instead of duplicating the text.
    const state = makeState()
    mapClaudeMessage(assistantText, state)
    const out = mapClaudeMessage(resultError, state)
    expect(out.at(-1)).toEqual({
      type: "turn-finished",
      runnerId: ROOT,
      error: { detail: "Hello there", messageId: "m_1" },
    })
  })

  it("does not correlate a turn error with a SUB-AGENT's text (root messages only)", () => {
    const state = makeState()
    mapClaudeMessage(assistantAgentSpawn, state)
    mapClaudeMessage(subAgentText, state)
    const out = mapClaudeMessage(resultError, state)
    expect(out.at(-1)).toEqual({
      type: "turn-finished",
      runnerId: ROOT,
      error: { detail: "Turn failed (error_during_execution)" },
    })
  })

  it("does not let a previous turn's message leak into a later turn error", () => {
    const state = makeState()
    mapClaudeMessage(assistantText, state)
    mapClaudeMessage(resultSuccess, state) // turn 1 ends cleanly
    const out = mapClaudeMessage(resultError, state) // turn 2 errors with no text
    expect(out.at(-1)).toEqual({
      type: "turn-finished",
      runnerId: ROOT,
      error: { detail: "Turn failed (error_during_execution)" },
    })
  })

  it("returns no events for an unrecognized message type (defensive)", () => {
    const out: readonly CanonicalEvent[] = mapClaudeMessage(
      { type: "mystery" },
      makeState(),
    )
    expect(out).toEqual([])
  })
})
