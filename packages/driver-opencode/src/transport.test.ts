import { describe, expect, it } from "bun:test"
import {
  permissionUpdatedFixture,
  sessionIdleFixture,
  textPartFixture,
  toolPartSequenceFixture,
} from "./fixtures/opencode-events"
import { OpencodeEventSchema } from "./transport"

describe("OpencodeEventSchema", () => {
  it("parses a message.part.updated (text part) envelope", () => {
    expect(OpencodeEventSchema.safeParse(textPartFixture).success).toBe(true)
  })

  it("parses the full tool-part lifecycle fixture sequence", () => {
    for (const event of toolPartSequenceFixture) {
      expect(OpencodeEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("parses permission.updated and session.idle", () => {
    expect(
      OpencodeEventSchema.safeParse(permissionUpdatedFixture).success,
    ).toBe(true)
    expect(OpencodeEventSchema.safeParse(sessionIdleFixture).success).toBe(true)
  })

  it("rejects a frame whose type string is unknown", () => {
    expect(
      OpencodeEventSchema.safeParse({ type: "totally.unknown", properties: {} })
        .success,
    ).toBe(false)
  })

  it("rejects a frame missing the discriminant type field", () => {
    expect(OpencodeEventSchema.safeParse({ properties: {} }).success).toBe(
      false,
    )
  })
})
