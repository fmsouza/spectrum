import { describe, it, expect } from "bun:test"
import { SessionSchema } from "./session"

const open = { id: "s_1", harnessId: "claude", alias: "default", startedAt: "2026-05-23T10:00:00.000Z" }

describe("SessionSchema", () => {
  it("parses an open session without endedAt/exitCode", () => {
    expect(SessionSchema.parse(open)).toEqual(open)
  })
  it("parses a closed session with endedAt and exitCode", () => {
    const closed = { ...open, endedAt: "2026-05-23T10:05:00.000Z", exitCode: 0 }
    expect(SessionSchema.parse(closed)).toEqual(closed)
  })
  it("rejects a startedAt that is not an ISO datetime", () => {
    expect(SessionSchema.safeParse({ ...open, startedAt: "yesterday" }).success).toBe(false)
  })
})
