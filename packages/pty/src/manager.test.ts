import { describe, expect, it } from "bun:test"
import {
  AliasNameSchema,
  HarnessIdSchema,
  SessionIdSchema,
} from "@launchkit/types"
import type { Session } from "@launchkit/types"
import { ok } from "@launchkit/utils"
import { createTerminalManager } from "./manager"
import type { PtyOutbound } from "./protocol"
import { bytesToBase64 } from "./protocol"
import { createFakePty } from "./pty"
import type { FakePty } from "./pty"

const sessionId = SessionIdSchema.parse(
  "s_00000000-0000-4000-8000-000000000000",
)
const otherId = SessionIdSchema.parse("s_11111111-1111-4111-8111-111111111111")
const harnessId = HarnessIdSchema.parse("claude")
const alias = AliasNameSchema.parse("default")
const launchInput = {
  harnessId,
  alias,
  command: "/bin/claude",
  args: [] as readonly string[],
  env: { PATH: "/usr/bin" },
}

const encode = (s: string): Uint8Array => new TextEncoder().encode(s)
const decode = (b: Uint8Array): string => new TextDecoder().decode(b)

const fakeSession: Session = {
  id: sessionId,
  harnessId,
  alias,
  startedAt: "2026-06-02T00:00:00.000Z",
}

const makeDeps = (): {
  sent: PtyOutbound[]
  closed: { id: string; code: number }[]
  pty: FakePty
  deps: Parameters<typeof createTerminalManager>[0]
} => {
  const sent: PtyOutbound[] = []
  const closed: { id: string; code: number }[] = []
  const pty = createFakePty()
  return {
    sent,
    closed,
    pty,
    deps: {
      pty: { open: () => ok(pty) },
      sessions: {
        create: () => ok(fakeSession),
        close: (id, code) => {
          closed.push({ id, code })
          return ok({ ...fakeSession, exitCode: code })
        },
      },
      send: (m) => {
        sent.push(m)
      },
      capBytes: 1024,
      defaultSize: { cols: 80, rows: 24 },
    },
  }
}

/** The webview's first resize is what actually spawns the harness (deferred-spawn). */
const resize = (
  manager: ReturnType<typeof createTerminalManager>,
  cols = 80,
  rows = 24,
): void => {
  manager.handleInbound({ type: "pty-resize", id: sessionId, cols, rows })
}

describe("createTerminalManager", () => {
  it("creates a session on launch and returns the sessionId", () => {
    const { deps } = makeDeps()
    const manager = createTerminalManager(deps)
    const res = manager.launch(launchInput)
    expect(res.ok && res.value.sessionId === sessionId).toBe(true)
  })

  it("does not spawn the harness until the first resize, then spawns at that size", () => {
    const opened: { cols: number; rows: number }[] = []
    const { deps, pty } = makeDeps()
    const manager = createTerminalManager({
      ...deps,
      pty: {
        open: (opts) => {
          opened.push({ cols: opts.cols, rows: opts.rows })
          return ok(pty)
        },
      },
    })
    manager.launch(launchInput)
    expect(opened).toHaveLength(0) // deferred — no spawn yet
    resize(manager, 100, 40)
    expect(opened).toEqual([{ cols: 100, rows: 40 }]) // spawned at the webview's size
  })

  it("streams pty output to the webview as base64 pty-data messages", () => {
    const { deps, sent, pty } = makeDeps()
    const manager = createTerminalManager(deps)
    manager.launch(launchInput)
    resize(manager)
    pty.emit("xyz")
    expect(sent).toContainEqual({
      type: "pty-data",
      id: sessionId,
      data: bytesToBase64(encode("xyz")),
    })
  })

  it("forwards pty-input keystrokes to the pty", () => {
    const { deps, pty } = makeDeps()
    const manager = createTerminalManager(deps)
    manager.launch(launchInput)
    resize(manager)
    manager.handleInbound({
      type: "pty-input",
      id: sessionId,
      data: bytesToBase64(encode("a")),
    })
    expect(pty.writes.map(decode)).toContain("a")
  })

  it("replays scrollback on attach", () => {
    const { deps, sent, pty } = makeDeps()
    const manager = createTerminalManager(deps)
    manager.launch(launchInput)
    resize(manager)
    pty.emit("history")
    sent.length = 0
    manager.handleInbound({ type: "pty-attach", id: sessionId })
    expect(sent[0]).toEqual({
      type: "pty-data",
      id: sessionId,
      data: bytesToBase64(encode("history")),
    })
  })

  it("closes the session with the exit code and emits pty-exit when the harness exits", () => {
    const { deps, sent, closed, pty } = makeDeps()
    const manager = createTerminalManager(deps)
    manager.launch(launchInput)
    resize(manager)
    pty.triggerExit(3)
    expect(closed).toEqual([{ id: sessionId, code: 3 }])
    expect(sent).toContainEqual({ type: "pty-exit", id: sessionId, code: 3 })
  })

  it("uses the send sink bound via bindSend instead of the original", () => {
    const { deps, sent, pty } = makeDeps()
    const manager = createTerminalManager(deps)
    const rebound: PtyOutbound[] = []
    manager.bindSend((m) => {
      rebound.push(m)
    })
    manager.launch(launchInput)
    resize(manager)
    pty.emit("zzz")
    expect(rebound).toContainEqual({
      type: "pty-data",
      id: sessionId,
      data: bytesToBase64(encode("zzz")),
    })
    expect(sent).toHaveLength(0)
  })

  it("ignores inbound messages for an unknown session id", () => {
    const { deps } = makeDeps()
    const manager = createTerminalManager(deps)
    manager.launch(launchInput)
    expect(() =>
      manager.handleInbound({ type: "pty-kill", id: otherId }),
    ).not.toThrow()
  })
})
