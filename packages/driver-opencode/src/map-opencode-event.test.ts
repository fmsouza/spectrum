import { describe, expect, it } from "bun:test"
import type { RunnerId } from "@launchkit/agent-events"
import {
  S_ROOT,
  childSessionCreatedFixture,
  childTextPartFixture,
  otherSessionTextFixture,
  permissionUpdatedFixture,
  sessionErrorFixture,
  sessionIdleFixture,
  textPartFixture,
  toolPartErrorFixture,
  toolPartSequenceFixture,
} from "./fixtures/opencode-events"
import {
  type OpencodeMapState,
  mapOpencodeEvent,
  newOpencodeMapState,
} from "./map-opencode-event"

const ROOT = "rnr_root" as RunnerId

// Bind the root session id and a deterministic child-id minter (the adapter passes ctx.newRunnerId in prod).
const mkState = (): OpencodeMapState => {
  let n = 0
  return newOpencodeMapState({
    rootRunnerId: ROOT,
    rootSessionId: S_ROOT,
    newRunnerId: () => `rnr_child_${++n}` as RunnerId,
  })
}

describe("mapOpencodeEvent", () => {
  it("maps a text part for the root session to a text-delta keyed by messageID", () => {
    const out = mapOpencodeEvent(textPartFixture, mkState())
    expect(out).toEqual([
      { type: "text-delta", runnerId: ROOT, messageId: "msg_1", text: "Hello" },
    ])
  })

  it("filters out events for an unrelated session (returns [])", () => {
    expect(mapOpencodeEvent(otherSessionTextFixture, mkState())).toEqual([])
  })

  it("maps the tool-part lifecycle to started (once) -> finished(ok, output)", () => {
    const state = mkState()
    const [pendingFx, runningFx, completedFx] = toolPartSequenceFixture
    const pending = mapOpencodeEvent(pendingFx, state)
    const running = mapOpencodeEvent(runningFx, state)
    const completed = mapOpencodeEvent(completedFx, state)
    // pending OR running announces the start exactly once; the other is a no-op.
    expect([...pending, ...running]).toEqual([
      {
        type: "tool-call-started",
        runnerId: ROOT,
        callId: "call_1",
        tool: "bash",
        input: { command: "ls" },
      },
    ])
    expect(completed).toEqual([
      {
        type: "tool-call-finished",
        runnerId: ROOT,
        callId: "call_1",
        status: "ok",
        output: "file-a\n",
      },
    ])
  })

  it("maps a tool error state to tool-call-finished(error) with the error text as output", () => {
    const state = mkState()
    const out = mapOpencodeEvent(toolPartErrorFixture, state)
    // Unseen callID: announce the start, then finish as error in the same event.
    expect(out).toEqual([
      {
        type: "tool-call-started",
        runnerId: ROOT,
        callId: "call_2",
        tool: "bash",
        input: { command: "nope" },
      },
      {
        type: "tool-call-finished",
        runnerId: ROOT,
        callId: "call_2",
        status: "error",
        output: "exit 1",
      },
    ])
  })

  it("emits [] for permission.updated (runtime bridge owns approval-requested; mapper is not the source)", () => {
    // The runtime ctx.requestApproval is the single source of truth for approval-requested events.
    // The mapper deliberately returns [] so no duplicate dangling card appears in the UI.
    const out = mapOpencodeEvent(permissionUpdatedFixture, mkState())
    expect(out).toEqual([])
  })

  it("maps a child session (parentID) to runner-started with a fresh child id + parentRunnerId, then routes its parts", () => {
    const state = mkState()
    const created = mapOpencodeEvent(childSessionCreatedFixture, state)
    expect(created).toEqual([
      {
        type: "runner-started",
        runnerId: "rnr_child_1",
        parentRunnerId: ROOT,
        title: "explore the codebase",
      },
    ])
    const childText = mapOpencodeEvent(childTextPartFixture, state)
    expect(childText).toEqual([
      {
        type: "text-delta",
        runnerId: "rnr_child_1",
        messageId: "msg_c1",
        text: "searching",
      },
    ])
  })

  it("maps session.idle for the root to turn-finished", () => {
    expect(mapOpencodeEvent(sessionIdleFixture, mkState())).toEqual([
      { type: "turn-finished", runnerId: ROOT },
    ])
  })

  it("maps session.error for the root to runner-finished(errored)", () => {
    const out = mapOpencodeEvent(sessionErrorFixture, mkState())
    expect(out).toEqual([
      {
        type: "runner-finished",
        runnerId: ROOT,
        status: "errored",
        error: "boom",
      },
    ])
  })

  it("ignores message.updated (assistant role marker; text arrives via parts) -> []", () => {
    const state = mkState()
    const out = mapOpencodeEvent(
      {
        type: "message.updated",
        properties: {
          info: { id: "msg_1", sessionID: S_ROOT, role: "assistant" },
        },
      },
      state,
    )
    expect(out).toEqual([])
  })

  it("ignores child fixtures with the wrong root binding when S_CHILD is the unrelated id", () => {
    // Without the child session.updated first, S_CHILD is unknown -> filtered.
    expect(mapOpencodeEvent(childTextPartFixture, mkState())).toEqual([])
  })
})
