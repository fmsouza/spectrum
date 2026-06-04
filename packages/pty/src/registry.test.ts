import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { createFakePty } from "./pty"
import { createTerminalRegistry } from "./registry"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("createTerminalRegistry", () => {
  it("registers a session with its pty and marks it running", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    expect(reg.get(id)?.status).toBe("running")
  })

  it("accumulates scrollback from appended data and replays it via snapshot", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    reg.appendData(id, new TextEncoder().encode("output"))
    expect(new TextDecoder().decode(reg.snapshot(id))).toBe("output")
  })

  it("marks a session exited with its code and keeps it queryable", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    reg.markExited(id, 0)
    expect(reg.get(id)?.status).toBe("exited")
    expect(reg.get(id)?.exitCode).toBe(0)
  })
})
