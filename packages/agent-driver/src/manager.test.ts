import { describe, expect, it } from "bun:test"
import type {
  CanonicalEvent,
  RunnerId,
  StoredEvent,
} from "@launchkit/agent-events"
import {
  HarnessIdSchema,
  type Session,
  SessionIdSchema,
} from "@launchkit/types"
import { createFixedClock, err, ok } from "@launchkit/utils"
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
})
