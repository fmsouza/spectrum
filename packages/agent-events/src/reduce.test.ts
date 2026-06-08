import { describe, expect, it } from "bun:test"
import type { RunnerId } from "@launchkit/types"
import type { CanonicalEvent } from "./events"
import {
  type RunState,
  type ToolCallItem,
  initialRunState,
  reduce,
} from "./reduce"

const rid = (s: string): RunnerId => s as RunnerId
const fold = (events: readonly CanonicalEvent[]): RunState =>
  events.reduce(reduce, initialRunState)

const started = (
  runnerId: string,
  extra: Partial<Extract<CanonicalEvent, { type: "runner-started" }>> = {},
): CanonicalEvent => ({
  type: "runner-started",
  runnerId: rid(runnerId),
  ...extra,
})

describe("reduce — runner lifecycle", () => {
  it("creates a running root runner and sets rootRunnerId when the first parentless runner starts", () => {
    const state = fold([started("root")])
    expect(state.rootRunnerId).toBe(rid("root"))
    const runner = state.runners.get(rid("root"))
    expect(runner?.status).toBe("running")
    expect(runner?.items).toEqual([])
  })

  it("does not overwrite rootRunnerId when a second parentless runner starts", () => {
    const state = fold([started("root"), started("other")])
    expect(state.rootRunnerId).toBe(rid("root"))
  })

  it("sets a runner's status when it finishes", () => {
    const state = fold([
      started("root"),
      { type: "runner-finished", runnerId: rid("root"), status: "completed" },
    ])
    expect(state.runners.get(rid("root"))?.status).toBe("completed")
  })

  it("ignores a runner-finished for an unknown runner", () => {
    const state = fold([
      started("root"),
      { type: "runner-finished", runnerId: rid("ghost"), status: "errored" },
    ])
    expect(state.runners.has(rid("ghost"))).toBe(false)
    expect(state.runners.get(rid("root"))?.status).toBe("running")
  })
})

describe("reduce — text/reasoning accumulation", () => {
  it("accumulates text-delta chunks into one message item by messageId", () => {
    const state = fold([
      started("root"),
      {
        type: "text-delta",
        runnerId: rid("root"),
        messageId: "m1",
        text: "Hel",
      },
      {
        type: "text-delta",
        runnerId: rid("root"),
        messageId: "m1",
        text: "lo",
      },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([
      { kind: "message", messageId: "m1", role: "assistant", text: "Hello" },
    ])
  })

  it("interleaves two concurrent messageIds on the same runner without mixing their text", () => {
    const state = fold([
      started("root"),
      { type: "text-delta", runnerId: rid("root"), messageId: "m1", text: "A" },
      { type: "text-delta", runnerId: rid("root"), messageId: "m2", text: "B" },
      { type: "text-delta", runnerId: rid("root"), messageId: "m1", text: "C" },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([
      { kind: "message", messageId: "m1", role: "assistant", text: "AC" },
      { kind: "message", messageId: "m2", role: "assistant", text: "B" },
    ])
  })

  it("accumulates reasoning-delta chunks into one reasoning item by messageId", () => {
    const state = fold([
      started("root"),
      {
        type: "reasoning-delta",
        runnerId: rid("root"),
        messageId: "r1",
        text: "a",
      },
      {
        type: "reasoning-delta",
        runnerId: rid("root"),
        messageId: "r1",
        text: "b",
      },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([{ kind: "reasoning", messageId: "r1", text: "ab" }])
  })
})

describe("reduce — tool calls", () => {
  it("pushes a running tool call on tool-call-started", () => {
    const state = fold([
      started("root"),
      {
        type: "tool-call-started",
        runnerId: rid("root"),
        callId: "c1",
        tool: "Bash",
        input: { command: "ls" },
      },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([
      {
        kind: "tool-call",
        callId: "c1",
        tool: "Bash",
        input: { command: "ls" },
        status: "running",
      },
    ])
  })

  it("appends tool-output-delta chunks to the matching tool call output", () => {
    const state = fold([
      started("root"),
      {
        type: "tool-call-started",
        runnerId: rid("root"),
        callId: "c1",
        tool: "Bash",
      },
      {
        type: "tool-output-delta",
        runnerId: rid("root"),
        callId: "c1",
        chunk: "foo",
      },
      {
        type: "tool-output-delta",
        runnerId: rid("root"),
        callId: "c1",
        chunk: "bar",
      },
    ])
    const item = (state.runners.get(rid("root"))?.items ??
      [])[0] as ToolCallItem
    expect(item.output).toBe("foobar")
    expect(item.status).toBe("running")
  })

  it("sets status/output/exitCode/result on tool-call-finished", () => {
    const state = fold([
      started("root"),
      {
        type: "tool-call-started",
        runnerId: rid("root"),
        callId: "c1",
        tool: "Bash",
      },
      {
        type: "tool-call-finished",
        runnerId: rid("root"),
        callId: "c1",
        status: "ok",
        output: "done",
        exitCode: 0,
        result: { ok: true },
      },
    ])
    const item = (state.runners.get(rid("root"))?.items ??
      [])[0] as ToolCallItem
    expect(item.status).toBe("ok")
    expect(item.output).toBe("done")
    expect(item.exitCode).toBe(0)
    expect(item.result).toEqual({ ok: true })
  })
})

describe("reduce — sub-runner linkage", () => {
  it("links a spawned sub-runner to its parent tool call via spawnedByCallId", () => {
    const state = fold([
      started("root"),
      {
        type: "tool-call-started",
        runnerId: rid("root"),
        callId: "c1",
        tool: "Task",
      },
      started("child", { parentRunnerId: rid("root"), spawnedByCallId: "c1" }),
    ])
    const parentItem = (state.runners.get(rid("root"))?.items ??
      [])[0] as ToolCallItem
    expect(parentItem.spawnedRunnerId).toBe(rid("child"))
    const child = state.runners.get(rid("child"))
    expect(child?.parentRunnerId).toBe(rid("root"))
    expect(child?.status).toBe("running")
  })
})

describe("reduce — file changes", () => {
  it("pushes a file-change item mapping kind to changeKind", () => {
    const state = fold([
      started("root"),
      {
        type: "file-change",
        runnerId: rid("root"),
        callId: "c1",
        path: "/x/y.ts",
        kind: "update",
        diff: "@@",
      },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([
      {
        kind: "file-change",
        callId: "c1",
        path: "/x/y.ts",
        changeKind: "update",
        diff: "@@",
      },
    ])
  })
})

describe("reduce — approvals", () => {
  it("pushes an approval item on approval-requested and resolves it on approval-resolved", () => {
    const state = fold([
      started("root"),
      {
        type: "approval-requested",
        runnerId: rid("root"),
        requestId: "req1",
        target: { kind: "command", detail: "rm -rf" },
      },
      {
        type: "approval-resolved",
        runnerId: rid("root"),
        requestId: "req1",
        decision: "allow",
        by: "user",
      },
    ])
    const items = state.runners.get(rid("root"))?.items ?? []
    expect(items).toEqual([
      {
        kind: "approval",
        requestId: "req1",
        target: { kind: "command", detail: "rm -rf" },
        decision: "allow",
        by: "user",
      },
    ])
  })
})

describe("reduce — usage", () => {
  it("sets runner usage on a usage event", () => {
    const state = fold([
      started("root"),
      {
        type: "usage",
        runnerId: rid("root"),
        usage: { inputTokens: 3, outputTokens: 4 },
      },
    ])
    expect(state.runners.get(rid("root"))?.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
    })
  })

  it("sets runner usage on turn-finished when usage is present", () => {
    const state = fold([
      started("root"),
      {
        type: "turn-finished",
        runnerId: rid("root"),
        usage: { inputTokens: 1, outputTokens: 2 },
      },
    ])
    expect(state.runners.get(rid("root"))?.usage).toEqual({
      inputTokens: 1,
      outputTokens: 2,
    })
  })

  it("leaves usage unset on turn-finished without usage", () => {
    const state = fold([
      started("root"),
      { type: "turn-finished", runnerId: rid("root") },
    ])
    expect(state.runners.get(rid("root"))?.usage).toBeUndefined()
  })
})

describe("reduce — annotation & defensiveness", () => {
  it("keeps state unchanged on an annotation event", () => {
    const before = fold([started("root")])
    const after = reduce(before, {
      type: "annotation",
      runnerId: rid("root"),
      kind: "todo",
      data: { items: [] },
    })
    expect(after.runners.get(rid("root"))?.items).toEqual([])
  })

  it("does not mutate the input state (purity)", () => {
    const before = fold([started("root")])
    const snapshot = before.runners.get(rid("root"))?.items
    const after = reduce(before, {
      type: "text-delta",
      runnerId: rid("root"),
      messageId: "m1",
      text: "hi",
    })
    expect(snapshot).toEqual([])
    expect(before.runners.get(rid("root"))?.items).toEqual([])
    // The original items array must be the exact same object reference — reduce
    // must not have replaced or mutated it in place.
    expect(after.runners.get(rid("root"))?.items).not.toBe(snapshot)
    expect(before.runners.get(rid("root"))?.items).toBe(snapshot)
  })

  it("is a no-op for a text-delta event whose runnerId was never started", () => {
    const state = fold([
      {
        type: "text-delta",
        runnerId: rid("ghost"),
        messageId: "m1",
        text: "hi",
      },
    ])
    expect(state.runners.size).toBe(0)
    expect(state.runners.has(rid("ghost"))).toBe(false)
  })
})

describe("reduce — event-sourcing invariant", () => {
  it("yields identical state whether folded all-at-once or one-by-one", () => {
    const log: readonly CanonicalEvent[] = [
      started("root"),
      {
        type: "text-delta",
        runnerId: rid("root"),
        messageId: "m1",
        text: "He",
      },
      {
        type: "tool-call-started",
        runnerId: rid("root"),
        callId: "c1",
        tool: "Task",
      },
      {
        type: "tool-output-delta",
        runnerId: rid("root"),
        callId: "c1",
        chunk: "out",
      },
      started("child", { parentRunnerId: rid("root"), spawnedByCallId: "c1" }),
      {
        type: "text-delta",
        runnerId: rid("child"),
        messageId: "m2",
        text: "sub",
      },
      {
        type: "tool-call-finished",
        runnerId: rid("root"),
        callId: "c1",
        status: "ok",
        output: "out",
      },
      {
        type: "text-delta",
        runnerId: rid("root"),
        messageId: "m1",
        text: "llo",
      },
      {
        type: "usage",
        runnerId: rid("root"),
        usage: { inputTokens: 5, outputTokens: 6 },
      },
      { type: "runner-finished", runnerId: rid("child"), status: "completed" },
      { type: "runner-finished", runnerId: rid("root"), status: "completed" },
    ]

    const allAtOnce = log.reduce(reduce, initialRunState)
    let oneByOne: RunState = initialRunState
    for (const event of log) oneByOne = reduce(oneByOne, event)

    const normalize = (s: RunState) => ({
      rootRunnerId: s.rootRunnerId,
      runners: [...s.runners.entries()],
    })
    expect(normalize(allAtOnce)).toEqual(normalize(oneByOne))
  })
})
