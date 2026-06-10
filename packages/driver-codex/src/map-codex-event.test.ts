import { describe, expect, it } from "bun:test"
import type { CanonicalEvent, RunnerId } from "@launchkit/agent-events"
import * as fx from "./fixtures/codex-events"
import { type CodexMapState, mapCodexEvent } from "./map-codex-event"

const root = "rnr_root" as RunnerId
const freshState = (): CodexMapState => ({
  rootRunnerId: root,
  messageIds: new Map(),
  callIds: new Map(),
  runnerIds: new Map(),
  newRunnerId: () => "rnr_child" as RunnerId,
  newCallId: (() => {
    let n = 0
    return () => `call_${++n}`
  })(),
  nextMessageId: (() => {
    let n = 0
    return () => `msg_${++n}`
  })(),
})

describe("mapCodexEvent — thread/turn lifecycle", () => {
  it("maps thread/started to nothing extra (root runner-started is emitted by the adapter on start)", () => {
    const out = mapCodexEvent(fx.threadStarted, freshState())
    expect(out).toEqual([])
  })

  it("maps turn/started to nothing (the root runner is already running)", () => {
    expect(mapCodexEvent(fx.turnStarted, freshState())).toEqual([])
  })

  it("maps turn/completed (status completed) to runner-finished(completed) on the root", () => {
    const out = mapCodexEvent(fx.turnCompleted, freshState())
    expect(out).toEqual([
      { type: "runner-finished", runnerId: root, status: "completed" },
    ] satisfies CanonicalEvent[])
  })

  it("maps turn/completed (status failed) to runner-finished(errored) carrying the error message", () => {
    const out = mapCodexEvent(fx.turnFailed, freshState())
    expect(out).toEqual([
      {
        type: "runner-finished",
        runnerId: root,
        status: "errored",
        error: "boom",
      },
    ] satisfies CanonicalEvent[])
  })

  it("maps turn/completed (status interrupted) to runner-finished(interrupted)", () => {
    const out = mapCodexEvent(fx.turnInterrupted, freshState())
    expect(out).toEqual([
      { type: "runner-finished", runnerId: root, status: "interrupted" },
    ] satisfies CanonicalEvent[])
  })

  it("maps thread/tokenUsage/updated to a usage event on the root with mapped token counts", () => {
    const out = mapCodexEvent(fx.tokenUsage, freshState())
    expect(out).toEqual([
      {
        type: "usage",
        runnerId: root,
        usage: { inputTokens: 20, outputTokens: 10, cachedInputTokens: 5 },
      },
    ] satisfies CanonicalEvent[])
  })

  it("ignores a retryable error notification", () => {
    expect(mapCodexEvent(fx.errorRetryable, freshState())).toEqual([])
  })

  it("maps a non-retryable error notification to runner-finished(errored)", () => {
    const out = mapCodexEvent(fx.errorFatal, freshState())
    expect(out).toEqual([
      {
        type: "runner-finished",
        runnerId: root,
        status: "errored",
        error: "fatal",
      },
    ] satisfies CanonicalEvent[])
  })
})
