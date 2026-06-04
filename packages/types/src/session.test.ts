import { describe, expect, it } from "bun:test"
import { SessionSchema } from "./session"

const open = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-05-23T10:00:00.000Z",
}

describe("SessionSchema", () => {
  it("parses an open session without endedAt/exitCode", () => {
    const parsed = SessionSchema.parse(open)
    expect(parsed.id).toBe<string>("s_1")
    expect(parsed.harnessId).toBe<string>("claude")
    expect(parsed.alias).toBe<string>("default")
    expect(parsed.startedAt).toBe("2026-05-23T10:00:00.000Z")
  })
  it("parses a closed session with endedAt and exitCode", () => {
    const closed = { ...open, endedAt: "2026-05-23T10:05:00.000Z", exitCode: 0 }
    const parsed = SessionSchema.parse(closed)
    expect(parsed.endedAt).toBe("2026-05-23T10:05:00.000Z")
    expect(parsed.exitCode).toBe(0)
  })
  it("parses a session with an optional name and cwd", () => {
    const named = { ...open, name: "My run", cwd: "/Users/fred/projects/app" }
    const parsed = SessionSchema.parse(named)
    expect(parsed.name).toBe("My run")
    expect(parsed.cwd).toBe("/Users/fred/projects/app")
  })
  it("parses an open session with name and cwd omitted", () => {
    const parsed = SessionSchema.parse(open)
    expect(parsed.name).toBeUndefined()
    expect(parsed.cwd).toBeUndefined()
  })
  it("rejects a startedAt that is not an ISO datetime", () => {
    expect(
      SessionSchema.safeParse({ ...open, startedAt: "yesterday" }).success,
    ).toBe(false)
  })
})
