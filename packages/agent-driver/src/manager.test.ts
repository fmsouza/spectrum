import { describe, expect, it } from "bun:test"
import type {
  CanonicalEvent,
  PermissionMode,
  QuestionAnswer,
  RunnerId,
  StoredEvent,
} from "@spectrum/agent-events"
import type { Logger } from "@spectrum/logger"
import {
  type HarnessId,
  HarnessIdSchema,
  type ModelId,
  type Session,
  SessionIdSchema,
} from "@spectrum/types"
import { createFixedClock, err, isOk, ok } from "@spectrum/utils"
import type { AgentDriver, AgentStartInput } from "./driver"
import { createFakeDriver } from "./fake-driver"
import type { FakeScript } from "./fake-driver"
import { createRunManager } from "./manager"
import type { RunEventSink, SessionSink } from "./ports"
import type { RunnerOutbound } from "./protocol"

const sessionId = SessionIdSchema.parse(
  "s_00000000-0000-4000-8000-000000000000",
)
const otherId = SessionIdSchema.parse("s_11111111-1111-4111-8111-111111111111")
const harnessId = HarnessIdSchema.parse("demo")
const root = "r_root" as RunnerId
const ts = "2026-06-08T12:00:00.000Z"
const clock = createFixedClock(new Date(ts))

const fakeSession: Session = {
  id: sessionId,
  harnessId,
  startedAt: "2026-06-08T00:00:00.000Z",
}

const startEvent: CanonicalEvent = {
  type: "runner-started",
  runnerId: root,
  title: "T",
}
const textEvent: CanonicalEvent = {
  type: "text-delta",
  runnerId: root,
  messageId: "m1",
  text: "hi",
}
const finishEvent: CanonicalEvent = {
  type: "runner-finished",
  runnerId: root,
  status: "completed",
}

const sync = (fn: () => void): void => fn()

type LogCall = {
  level: "debug" | "info" | "warn" | "error" | "fatal"
  msg: string
  fields?: Record<string, unknown>
}

const createFakeLogger = (): { logger: Logger; calls: LogCall[] } => {
  const calls: LogCall[] = []
  const record =
    (level: LogCall["level"]) =>
    (msg: string, fields?: Record<string, unknown>): void => {
      calls.push({ level, msg, ...(fields !== undefined ? { fields } : {}) })
    }
  const logger: Logger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    child: () => logger,
  }
  return { logger, calls }
}

const makeDeps = (
  script: FakeScript,
): {
  sent: RunnerOutbound[]
  created: unknown[]
  closed: { id: string; code: number }[]
  appended: CanonicalEvent[]
  deps: Parameters<typeof createRunManager>[0]
} => {
  const sent: RunnerOutbound[] = []
  const created: unknown[] = []
  const closed: { id: string; code: number }[] = []
  const appended: CanonicalEvent[] = []
  let seq = -1
  const store: StoredEvent[] = []
  const sessions: SessionSink = {
    create: (input) => {
      created.push(input)
      return ok(fakeSession)
    },
    close: (id, code) => {
      closed.push({ id, code })
      return ok({ ...fakeSession, exitCode: code })
    },
  }
  const events: RunEventSink = {
    append: (sid, event) => {
      seq += 1
      appended.push(event)
      store.push({ seq, sessionId: sid, ts, event })
      return ok({ seq })
    },
    read: () => ok(store),
  }
  return {
    sent,
    created,
    closed,
    appended,
    deps: {
      driver: createFakeDriver({ script, scheduler: sync }),
      sessions,
      events,
      clock,
      send: (m) => {
        sent.push(m)
      },
    },
  }
}

const scriptOf = (start: readonly CanonicalEvent[]): FakeScript => ({
  rootRunnerId: root,
  reactions: [{ on: "start", emit: start }],
})

describe("createRunManager.launch", () => {
  it("creates a session and returns its id when launched", () => {
    const { deps, created } = makeDeps(scriptOf([]))
    const manager = createRunManager(deps)
    const res = manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(res.ok && res.value.sessionId).toBe(sessionId)
    expect(created).toHaveLength(1)
  })

  it("persists each driver event in order via the RunEventSink", () => {
    const { deps, appended } = makeDeps(scriptOf([startEvent, textEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(appended).toEqual([startEvent, textEvent])
  })

  it("forwards each persisted event as a stamped runner-event frame", () => {
    const { deps, sent } = makeDeps(scriptOf([startEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(sent).toEqual([
      {
        type: "runner-event",
        id: sessionId,
        event: { seq: 0, sessionId, ts, event: startEvent },
      },
    ])
  })

  it("closes the session with code 0 when the root runner finishes", () => {
    const { deps, closed } = makeDeps(scriptOf([startEvent, finishEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(closed).toEqual([{ id: sessionId, code: 0 }])
  })

  it("does not close the session when a NON-root runner finishes", () => {
    const sub = "r_sub" as RunnerId
    const subFinish: CanonicalEvent = {
      type: "runner-finished",
      runnerId: sub,
      status: "completed",
    }
    const { deps, closed } = makeDeps(scriptOf([startEvent, subFinish]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(closed).toEqual([])
  })

  it("forwards name and cwd to sessions.create", () => {
    const { deps, created } = makeDeps(scriptOf([]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, name: "run x", cwd: "/work", env: {} })
    expect(created).toContainEqual({ harnessId, name: "run x", cwd: "/work" })
  })

  it("forwards the resolved command to driver.start", () => {
    let captured: AgentStartInput | undefined
    const capturingDriver: AgentDriver = {
      start: (i) => {
        captured = i
        return ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: () => ok(undefined),
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
        })
      },
    }
    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver: capturingDriver })
    manager.launch({
      harnessId,
      cwd: "/tmp",
      env: {},
      command: "/abs/claude",
      args: ["app-server", "-c", "x=1"],
    })
    expect(captured?.command).toBe("/abs/claude")
    expect(captured?.args).toEqual(["app-server", "-c", "x=1"])
  })

  it("forwards permissionMode to driver.start when the launch input carries one", () => {
    let captured: AgentStartInput | undefined
    const capturingDriver: AgentDriver = {
      start: (i) => {
        captured = i
        return ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: () => ok(undefined),
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
        })
      },
    }
    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver: capturingDriver })
    manager.launch({ harnessId, cwd: "/tmp", env: {}, permissionMode: "plan" })
    expect(captured?.permissionMode).toBe("plan")
  })

  it("closes the session even when the final event fails to persist", () => {
    // Arrange: append always fails so persist never succeeds.
    const sent: RunnerOutbound[] = []
    const closed: { id: string; code: number }[] = []
    const sessions: SessionSink = {
      create: () => ok(fakeSession),
      close: (id, code) => {
        closed.push({ id, code })
        return ok({ ...fakeSession, exitCode: code })
      },
    }
    const events: RunEventSink = {
      append: () => err({ detail: "boom" }),
      read: () => ok([]),
    }
    const deps: Parameters<typeof createRunManager>[0] = {
      driver: createFakeDriver({
        script: scriptOf([startEvent, finishEvent]),
        scheduler: sync,
      }),
      sessions,
      events,
      clock,
      send: (m) => {
        sent.push(m)
      },
    }
    // Act
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    // Assert: no frames forwarded (append failed), but session was still closed
    expect(sent).toEqual([])
    expect(closed).toEqual([{ id: sessionId, code: 0 }])
  })

  it("logs info with safe ids when a session launches", () => {
    const { deps } = makeDeps(scriptOf([]))
    const { logger, calls } = createFakeLogger()
    const manager = createRunManager({ ...deps, logger })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    const launched = calls.find(
      (c) => c.level === "info" && c.msg === "session launched",
    )
    expect(launched).toBeDefined()
    expect(launched?.fields).toEqual({ sessionId, harnessId })
  })

  it("logs error with the failure kind when the driver fails to start", () => {
    const failingDriver: AgentDriver = {
      start: () => err({ kind: "start-failed", detail: "boom" }),
    }
    const { deps } = makeDeps(scriptOf([]))
    const { logger, calls } = createFakeLogger()
    const manager = createRunManager({ ...deps, driver: failingDriver, logger })
    const res = manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(res.ok).toBe(false)
    const failed = calls.find((c) => c.level === "error")
    expect(failed).toBeDefined()
    expect(failed?.fields).toEqual({ kind: "start-failed", harnessId })
  })

  it("logs info when the root runner finishes and the session closes", () => {
    const { deps } = makeDeps(scriptOf([startEvent, finishEvent]))
    const { logger, calls } = createFakeLogger()
    const manager = createRunManager({ ...deps, logger })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    const closedLog = calls.find(
      (c) => c.level === "info" && c.msg === "session closed",
    )
    expect(closedLog).toBeDefined()
    expect(closedLog?.fields).toEqual({ sessionId })
  })

  it("never logs message content or prompts", () => {
    const { deps } = makeDeps(scriptOf([startEvent, textEvent]))
    const { logger, calls } = createFakeLogger()
    const manager = createRunManager({ ...deps, logger })
    manager.launch({
      harnessId,
      cwd: "/tmp",
      env: {},
      initialPrompt: "SECRET-PROMPT-XYZ",
    })
    const serialized = JSON.stringify(calls)
    expect(serialized).not.toContain("SECRET-PROMPT-XYZ")
    expect(serialized).not.toContain("hi")
  })
})

describe("createRunManager.handleInbound", () => {
  it("replays the stored backlog as runner-event frames on run-attach", () => {
    const { deps, sent } = makeDeps(scriptOf([startEvent, textEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    sent.length = 0
    manager.handleInbound({ type: "run-attach", id: sessionId })
    expect(sent).toEqual([
      {
        type: "runner-event",
        id: sessionId,
        event: { seq: 0, sessionId, ts, event: startEvent },
      },
      {
        type: "runner-event",
        id: sessionId,
        event: { seq: 1, sessionId, ts, event: textEvent },
      },
    ])
  })

  it("routes run-send to the session, producing the send batch's events", () => {
    const script: FakeScript = {
      rootRunnerId: root,
      reactions: [
        { on: "start", emit: [startEvent] },
        { on: "send", emit: [textEvent] },
      ],
    }
    const { deps, sent } = makeDeps(script)
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    sent.length = 0
    manager.handleInbound({ type: "run-send", id: sessionId, text: "go" })
    expect(sent).toContainEqual({
      type: "runner-event",
      id: sessionId,
      event: { seq: 1, sessionId, ts, event: textEvent },
    })
  })

  it("routes run-approve to the session, producing the approve batch's events", () => {
    const resolved: CanonicalEvent = {
      type: "approval-resolved",
      runnerId: root,
      requestId: "req_1",
      decision: "allow",
      by: "user",
    }
    const script: FakeScript = {
      rootRunnerId: root,
      reactions: [
        { on: "start", emit: [startEvent] },
        { on: "approve", emit: [resolved] },
      ],
    }
    const { deps, sent } = makeDeps(script)
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    sent.length = 0
    manager.handleInbound({
      type: "run-approve",
      id: sessionId,
      requestId: "req_1",
      decision: "allow",
    })
    expect(sent).toContainEqual({
      type: "runner-event",
      id: sessionId,
      event: { seq: 1, sessionId, ts, event: resolved },
    })
  })

  it("routes run-interrupt to the session, producing the interrupt batch's events", () => {
    const interrupted: CanonicalEvent = {
      type: "runner-finished",
      runnerId: root,
      status: "interrupted",
    }
    const script: FakeScript = {
      rootRunnerId: root,
      reactions: [
        { on: "start", emit: [startEvent] },
        { on: "interrupt", emit: [interrupted] },
      ],
    }
    const { deps, sent, closed } = makeDeps(script)
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    sent.length = 0
    manager.handleInbound({ type: "run-interrupt", id: sessionId })
    expect(sent).toContainEqual({
      type: "runner-event",
      id: sessionId,
      event: { seq: 1, sessionId, ts, event: interrupted },
    })
    // root runner-finished from interrupt also closes the session
    expect(closed).toEqual([{ id: sessionId, code: 0 }])
  })

  it("drops inbound messages for an unknown session id", () => {
    const { deps, sent } = makeDeps(scriptOf([startEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    sent.length = 0
    expect(() =>
      manager.handleInbound({ type: "run-send", id: otherId, text: "x" }),
    ).not.toThrow()
    expect(sent).toEqual([])
  })
})

describe("createRunManager.handleInbound run-answer", () => {
  it("routes run-answer to the session", () => {
    const calls: Array<{ requestId: string; answer: QuestionAnswer }> = []
    const capturingDriver: AgentDriver = {
      start: () =>
        ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: (requestId: string, answer: QuestionAnswer) => {
            calls.push({ requestId, answer })
            return ok(undefined)
          },
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
        }),
    }
    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver: capturingDriver })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    manager.handleInbound({
      type: "run-answer",
      id: sessionId,
      requestId: "q1",
      answer: { selections: [{ questionIndex: 0, labels: ["A"] }] },
    })
    expect(calls[0]?.requestId).toBe("q1")
    expect(calls[0]?.answer).toEqual({
      selections: [{ questionIndex: 0, labels: ["A"] }],
    })
  })
})

describe("createRunManager.handleInbound run-set-mode", () => {
  it("calls setMode on the live session with the requested mode", () => {
    const modeCalls: PermissionMode[] = []
    const capturingDriver: AgentDriver = {
      start: () =>
        ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: () => ok(undefined),
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
          setMode: (mode) => {
            modeCalls.push(mode)
            return ok(undefined)
          },
        }),
    }
    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver: capturingDriver })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    manager.handleInbound({
      type: "run-set-mode",
      id: sessionId,
      mode: "bypass",
    })
    expect(modeCalls).toEqual(["bypass"])
  })

  it("is a safe no-op for an unknown session id", () => {
    const { deps } = makeDeps(scriptOf([startEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(() =>
      manager.handleInbound({
        type: "run-set-mode",
        id: otherId,
        mode: "bypass",
      }),
    ).not.toThrow()
  })
})

describe("createRunManager.handleInbound run-set-model", () => {
  it("calls setModel on the live session with the requested modelId", () => {
    const modelCalls: string[] = []
    const capturingDriver: AgentDriver = {
      start: () =>
        ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: () => ok(undefined),
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
          setModel: (modelId) => {
            modelCalls.push(String(modelId))
            return ok(undefined)
          },
        }),
    }
    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver: capturingDriver })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    manager.handleInbound({
      type: "run-set-model",
      id: sessionId,
      modelId: "mdl_x" as never,
    })
    expect(modelCalls).toEqual(["mdl_x"])
  })

  it("is a safe no-op for an unknown session id", () => {
    const { deps } = makeDeps(scriptOf([startEvent]))
    const manager = createRunManager(deps)
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(() =>
      manager.handleInbound({
        type: "run-set-model",
        id: otherId,
        modelId: "mdl_x" as ModelId,
      }),
    ).not.toThrow()
  })

  it("resolves the proxied env and passes it to setModel on run-set-model", async () => {
    const setModelCalls: Array<{
      modelId: string
      env?: Readonly<Record<string, string>>
    }> = []

    // Local recording fake — extends the session stub just for this test.
    const makeRecordingDriver = (
      record: (
        modelId: ModelId,
        env?: Readonly<Record<string, string>>,
      ) => void,
    ): AgentDriver => ({
      start: () =>
        ok({
          rootRunnerId: root,
          onEvent: () => undefined,
          send: () => ok(undefined),
          respondApproval: () => ok(undefined),
          respondQuestion: () => ok(undefined),
          interrupt: () => ok(undefined),
          close: () => ok(undefined),
          setModel: (modelId, env) => {
            record(modelId, env)
            return ok(undefined)
          },
        }),
    })

    const driver = makeRecordingDriver((modelId, env) =>
      setModelCalls.push({
        modelId: String(modelId),
        ...(env !== undefined ? { env } : {}),
      }),
    )

    const resolveModelEnv = async ({
      modelId,
    }: {
      harnessId: HarnessId
      modelId: ModelId
    }): Promise<Readonly<Record<string, string>>> => ({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
      ANTHROPIC_MODEL: String(modelId),
    })

    const { deps } = makeDeps(scriptOf([]))
    const manager = createRunManager({ ...deps, driver, resolveModelEnv })
    const launched = manager.launch({
      harnessId: "claude" as HarnessId,
      cwd: "/tmp",
      env: {},
    })
    expect(isOk(launched)).toBe(true)
    if (!isOk(launched)) return

    manager.handleInbound({
      type: "run-set-model",
      id: launched.value.sessionId,
      modelId: "mdl_x" as ModelId,
    })

    // Flush async: resolveModelEnv is a Promise, so we wait for it to settle.
    await new Promise((r) => setTimeout(r, 0))

    expect(setModelCalls).toEqual([
      {
        modelId: "mdl_x",
        env: {
          ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
          ANTHROPIC_MODEL: "mdl_x",
        },
      },
    ])
  })
})

describe("createRunManager.bindSend", () => {
  it("uses the rebound sink instead of the original after bindSend", () => {
    const { deps, sent } = makeDeps(scriptOf([startEvent]))
    const manager = createRunManager(deps)
    const rebound: RunnerOutbound[] = []
    manager.bindSend((m) => {
      rebound.push(m)
    })
    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    expect(rebound).toHaveLength(1)
    expect(sent).toHaveLength(0)
  })

  it("captures events in-run-attach replay even when the initial microtask send goes to a no-op sink (proxy for WS-not-yet-bound race)", async () => {
    // The real-app scenario: manager created with no-op `send: () => {}`, then a WS
    // connects later. Events emitted via queueMicrotask during launch are stored in the
    // RunEventSink but dropped by the no-op send. When the WS later connects and the
    // webview sends run-attach, the replay must re-send the missed events.
    const store: StoredEvent[] = []
    let seq = -1
    const noopSend = (): void => {}
    const manager = createRunManager({
      driver: createFakeDriver({
        script: {
          rootRunnerId: root,
          reactions: [{ on: "start", emit: [startEvent, textEvent] }],
        },
      }),
      sessions: {
        create: () => ok(fakeSession),
        close: () => ok({ ...fakeSession, exitCode: 0 }),
      },
      events: {
        append: (sid, event) => {
          seq += 1
          store.push({ seq, sessionId: sid, ts, event })
          return ok({ seq })
        },
        read: () => ok(store),
      },
      clock,
      send: noopSend,
    })

    manager.launch({ harnessId, cwd: "/tmp", env: {} })
    // Flush microtasks — events stored but forwarded to no-op
    await new Promise((r) => setTimeout(r, 0))
    expect(store).toHaveLength(2)
    expect(store[0]?.event).toEqual(startEvent)
    expect(store[1]?.event).toEqual(textEvent)

    // WS now connects
    const rebound: RunnerOutbound[] = []
    manager.bindSend((m) => rebound.push(m))

    // run-attach replays stored backlog
    manager.handleInbound({ type: "run-attach", id: sessionId })
    expect(rebound).toHaveLength(2)
    expect(rebound[0]).toMatchObject({
      type: "runner-event",
      id: sessionId,
      event: store[0],
    })
    expect(rebound[1]).toMatchObject({
      type: "runner-event",
      id: sessionId,
      event: store[1],
    })
  })

  it("replays stored backlog via run-attach after initial no-op send (async timing)", async () => {
    // Simulate the real app: manager created with no-op send, WS connects later.
    // Events emitted via microtask are stored but not forwarded; run-attach replay
    // must send them after bindSend.
    const store: StoredEvent[] = []
    let seq = -1
    const noopSend = (): void => {} // like the real composition's `send: () => {}`
    const manager = createRunManager({
      driver: createFakeDriver({
        script: {
          rootRunnerId: root,
          reactions: [{ on: "start", emit: [startEvent] }],
        },
        // Uses default queueMicrotask so events fire asynchronously
      }),
      sessions: {
        create: () => ok(fakeSession),
        close: () => ok({ ...fakeSession, exitCode: 0 }),
      },
      events: {
        append: (_sid, event) => {
          seq += 1
          store.push({ seq, sessionId, ts, event })
          return ok({ seq })
        },
        read: () => ok(store),
      },
      clock,
      send: noopSend,
    })

    // Launch — events are queued via queueMicrotask
    manager.launch({ harnessId, cwd: "/tmp", env: {} })

    // Flush microtasks: events stored but sent to no-op
    await new Promise((r) => setTimeout(r, 0))

    // Events should be stored but not forwarded (no-op sink — nothing is capturing them)
    expect(store).toHaveLength(1)
    expect(store[0]?.event).toEqual(startEvent)

    // Now the WS connects — bindSend replaces the no-op
    const rebound: RunnerOutbound[] = []
    manager.bindSend((m) => {
      rebound.push(m)
    })

    // The webview sends run-attach to replay stored events
    manager.handleInbound({ type: "run-attach", id: sessionId })
    expect(rebound).toHaveLength(1)
    const replayed = store[0]
    if (replayed === undefined) throw new Error("no stored event to replay")
    expect(rebound[0]).toEqual({
      type: "runner-event",
      id: sessionId,
      event: replayed,
    })
  })
})
