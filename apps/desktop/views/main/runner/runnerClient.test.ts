import { describe, expect, it } from "bun:test"
import type { RunnerOutbound } from "@launchkit/agent-driver"
import type { StoredEvent } from "@launchkit/agent-events"
import { SessionIdSchema } from "@launchkit/types"
import { createRunnerClient } from "./runnerClient"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

const storedEvent: StoredEvent = {
  seq: 0,
  sessionId: id,
  ts: "2026-06-08T10:00:00.000Z",
  event: {
    type: "text-delta",
    runnerId: "run_root" as never,
    messageId: "m1",
    text: "hi",
  },
}

describe("createRunnerClient", () => {
  it("sends a run-attach message", () => {
    const sent: unknown[] = []
    const c = createRunnerClient((m) => sent.push(m))
    c.attach(id)
    expect(sent).toEqual([{ type: "run-attach", id }])
  })

  it("sends a run-send message with the turn text", () => {
    const sent: unknown[] = []
    const c = createRunnerClient((m) => sent.push(m))
    c.send(id, "do it")
    expect(sent).toEqual([{ type: "run-send", id, text: "do it" }])
  })

  it("sends a run-approve message with the decision", () => {
    const sent: unknown[] = []
    const c = createRunnerClient((m) => sent.push(m))
    c.approve(id, "rq1", "allow")
    expect(sent).toEqual([
      { type: "run-approve", id, requestId: "rq1", decision: "allow" },
    ])
  })

  it("sends a run-interrupt message", () => {
    const sent: unknown[] = []
    const c = createRunnerClient((m) => sent.push(m))
    c.interrupt(id)
    expect(sent).toEqual([{ type: "run-interrupt", id }])
  })

  it("dispatches a runner-event frame to the registered per-session listener", () => {
    const c = createRunnerClient(() => {})
    const got: StoredEvent[] = []
    c.onEvent(id, (e) => got.push(e))
    const frame: RunnerOutbound = {
      type: "runner-event",
      id,
      event: storedEvent,
    }
    c.dispatch(frame)
    expect(got).toEqual([storedEvent])
  })

  it("ignores a frame for a session with no listener", () => {
    const c = createRunnerClient(() => {})
    const frame: RunnerOutbound = {
      type: "runner-event",
      id,
      event: storedEvent,
    }
    expect(() => c.dispatch(frame)).not.toThrow()
  })
})
