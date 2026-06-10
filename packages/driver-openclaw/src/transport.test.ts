import { describe, expect, it } from "bun:test"
import {
  runStartedFixture,
  toolCallSequenceFixture,
} from "./fixtures/openclaw-events"
import { OpenClawEventSchema } from "./transport"

describe("OpenClawEventSchema", () => {
  it("parses a run.started normalized envelope", () => {
    const parsed = OpenClawEventSchema.safeParse(runStartedFixture)
    expect(parsed.success).toBe(true)
  })

  it("parses the full tool.call.* lifecycle fixture sequence", () => {
    for (const event of toolCallSequenceFixture) {
      expect(OpenClawEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("rejects a frame whose event string is unknown", () => {
    const bad = { type: "event", event: "totally.unknown", payload: {} }
    expect(OpenClawEventSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects a frame missing the discriminant event field", () => {
    expect(
      OpenClawEventSchema.safeParse({ type: "event", payload: {} }).success,
    ).toBe(false)
  })
})
