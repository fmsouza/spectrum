import { describe, expect, it } from "bun:test"
import type { RunnerOutbound } from "@spectrum/agent-driver"
import type { SessionId } from "@spectrum/types"
import {
  type SessionInfoResolver,
  mapRunFinished,
} from "./run-finished-mapping"

const sessionId = "sess-1" as SessionId

const frame = (inner: RunnerOutbound["event"]["event"]): RunnerOutbound => ({
  type: "runner-event",
  id: sessionId,
  event: {
    seq: 1,
    sessionId,
    ts: "2026-06-15T00:00:00.000Z",
    event: inner,
  },
})

const resolver: SessionInfoResolver = (id) =>
  id === "sess-1" ? { harnessId: "claude", cwd: "/work/proj" } : undefined

describe("mapRunFinished", () => {
  it("maps a runner-finished:errored frame to an errored RunFinished", () => {
    const result = mapRunFinished(
      frame({ type: "runner-finished", runnerId: "r1", status: "errored" }),
      resolver,
    )
    expect(result).toEqual({
      sessionId: "sess-1",
      harnessId: "claude",
      status: "errored",
      cwd: "/work/proj",
    })
  })

  it("maps a runner-finished:completed frame to a completed RunFinished", () => {
    const result = mapRunFinished(
      frame({ type: "runner-finished", runnerId: "r1", status: "completed" }),
      resolver,
    )
    expect(result).toEqual({
      sessionId: "sess-1",
      harnessId: "claude",
      status: "completed",
      cwd: "/work/proj",
    })
  })

  it("returns null for an interrupted runner-finished frame", () => {
    const result = mapRunFinished(
      frame({ type: "runner-finished", runnerId: "r1", status: "interrupted" }),
      resolver,
    )
    expect(result).toBeNull()
  })

  it("returns null for a non-finished event frame", () => {
    const result = mapRunFinished(
      frame({
        type: "text-delta",
        runnerId: "r1",
        messageId: "m1",
        text: "hi",
      }),
      resolver,
    )
    expect(result).toBeNull()
  })

  it("falls back to an empty harnessId and omits cwd when the session is unknown", () => {
    const result = mapRunFinished(
      {
        type: "runner-event",
        id: "unknown" as SessionId,
        event: {
          seq: 1,
          sessionId: "unknown" as SessionId,
          ts: "2026-06-15T00:00:00.000Z",
          event: {
            type: "runner-finished",
            runnerId: "r1",
            status: "completed",
          },
        },
      },
      resolver,
    )
    expect(result).toEqual({
      sessionId: "unknown",
      harnessId: "",
      status: "completed",
    })
  })
})
