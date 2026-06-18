import { describe, expect, it } from "bun:test"
import type { RunnerId } from "@spectrum/agent-events"
import { HarnessIdSchema } from "@spectrum/types"
import { ok } from "@spectrum/utils"
import type { AgentDriver, AgentSession, DriverError } from "./driver"
import type { RunEventSink, SessionSink } from "./ports"

describe("agent-driver seam types", () => {
  it("constructs an AgentSession + AgentDriver that satisfy the interfaces", () => {
    const session: AgentSession = {
      rootRunnerId: "r_root" as RunnerId,
      onEvent: () => undefined,
      send: () => ok(undefined),
      respondApproval: () => ok(undefined),
      respondQuestion: () => ok(undefined),
      interrupt: () => ok(undefined),
      close: () => ok(undefined),
    }
    const driver: AgentDriver = {
      start: () => ok(session),
    }
    const started = driver.start({
      harnessId: HarnessIdSchema.parse("demo"),
      cwd: "/tmp",
      env: {},
    })
    expect(started.ok && started.value.rootRunnerId).toBe("r_root" as RunnerId)
  })

  it("models a DriverError with one of the four kinds", () => {
    const e: DriverError = { kind: "start-failed", detail: "boom" }
    expect(e.kind).toBe("start-failed")
  })

  it("constructs SessionSink + RunEventSink port stand-ins", () => {
    const sessions: Pick<SessionSink, "close"> = {
      close: (_id, code) =>
        ok({
          id: _id,
          harnessId: HarnessIdSchema.parse("demo"),
          startedAt: "2026-06-08T00:00:00.000Z",
          exitCode: code,
        }),
    }
    const events: Pick<RunEventSink, "append"> = {
      append: () => ok({ seq: 0 }),
    }
    expect(typeof sessions.close).toBe("function")
    expect(
      events.append("s" as never, {
        type: "turn-finished",
        runnerId: "r" as RunnerId,
      }).ok,
    ).toBe(true)
  })
})
