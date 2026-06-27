import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@spectrum/types"
import { resolveTerminalCwd } from "./terminal-cwd"

const sessionId = SessionIdSchema.parse(
  "s_00000000-0000-4000-8000-000000000000",
)

const makeDeps = (
  overrides: Partial<Parameters<typeof resolveTerminalCwd>[0]> = {},
) => ({
  sessionCwd: "/sessions/x" as string | undefined,
  projectPath: "/projects/x" as string | undefined,
  homeDir: "/home/user",
  exists: async (p: string) => !p.includes("missing"),
  ...overrides,
})

describe("resolveTerminalCwd", () => {
  it("returns session.cwd when it exists on disk", async () => {
    const r = await resolveTerminalCwd({ sessionId, ...makeDeps() })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cwd).toBe("/sessions/x")
  })

  it("falls back to project path when session.cwd is missing on disk", async () => {
    const r = await resolveTerminalCwd({
      sessionId,
      ...makeDeps({ sessionCwd: "/missing/x" }),
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cwd).toBe("/projects/x")
  })

  it("falls back to home when session.cwd is undefined and project path missing", async () => {
    const r = await resolveTerminalCwd({
      sessionId,
      ...makeDeps({ sessionCwd: undefined, projectPath: "/missing/p" }),
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cwd).toBe("/home/user")
  })

  it("returns cwd-missing error when the whole chain fails", async () => {
    const r = await resolveTerminalCwd({
      sessionId,
      ...makeDeps({
        sessionCwd: "/missing/x",
        projectPath: "/missing/p",
        homeDir: "/missing/home",
        exists: async () => false,
      }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("cwd-missing")
  })
})
