import { describe, expect, it } from "bun:test"
import type { CanonicalEvent, RunnerId } from "@launchkit/agent-events"
import { createFakeDriver, demoScript } from "./fake-driver"
import type { FakeScript } from "./fake-driver"

const sync = (fn: () => void): void => fn()
const root = "r_root" as RunnerId

const startEvent: CanonicalEvent = { type: "runner-started", runnerId: root }
const finishEvent: CanonicalEvent = {
  type: "runner-finished",
  runnerId: root,
  status: "completed",
}

const script: FakeScript = {
  rootRunnerId: root,
  reactions: [
    { on: "start", emit: [startEvent] },
    {
      on: "send",
      emit: [
        { type: "text-delta", runnerId: root, messageId: "m1", text: "hi" },
      ],
    },
    {
      on: "approve",
      emit: [
        {
          type: "approval-resolved",
          runnerId: root,
          requestId: "req_1",
          decision: "allow",
          by: "user",
        },
      ],
    },
    { on: "interrupt", emit: [finishEvent] },
  ],
}

describe("createFakeDriver", () => {
  it("exposes the script's rootRunnerId on the started session", () => {
    const driver = createFakeDriver({ script, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    expect(started.ok && started.value.rootRunnerId).toBe(root)
  })

  it("emits the start batch only after onEvent is registered", () => {
    const driver = createFakeDriver({ script, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    expect(seen).toEqual([startEvent])
  })

  it("dequeues exactly one send batch per send() call, in order", () => {
    const twoSends: FakeScript = {
      rootRunnerId: root,
      reactions: [
        { on: "start", emit: [] },
        {
          on: "send",
          emit: [
            { type: "text-delta", runnerId: root, messageId: "m1", text: "a" },
          ],
        },
        {
          on: "send",
          emit: [
            { type: "text-delta", runnerId: root, messageId: "m2", text: "b" },
          ],
        },
      ],
    }
    const driver = createFakeDriver({ script: twoSends, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    seen.length = 0
    started.value.send({ text: "first" })
    started.value.send({ text: "second" })
    expect(seen).toEqual([
      { type: "text-delta", runnerId: root, messageId: "m1", text: "a" },
      { type: "text-delta", runnerId: root, messageId: "m2", text: "b" },
    ])
  })

  it("emits the approve batch when respondApproval is called", () => {
    const driver = createFakeDriver({ script, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    seen.length = 0
    started.value.respondApproval("req_1", "allow")
    expect(seen).toEqual([
      {
        type: "approval-resolved",
        runnerId: root,
        requestId: "req_1",
        decision: "allow",
        by: "user",
      },
    ])
  })

  it("emits the interrupt batch when interrupt is called", () => {
    const driver = createFakeDriver({ script, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    seen.length = 0
    started.value.interrupt()
    expect(seen).toEqual([finishEvent])
  })

  it("returns ok with no events when a command has no remaining batch", () => {
    const driver = createFakeDriver({ script, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    seen.length = 0
    started.value.send({ text: "one" })
    seen.length = 0
    const second = started.value.send({ text: "two" })
    expect(second.ok).toBe(true)
    expect(seen).toEqual([])
  })
})

describe("demoScript", () => {
  it("starts a root runner and includes a tool call, a spawned sub-runner, and an approval request", () => {
    const driver = createFakeDriver({ script: demoScript, scheduler: sync })
    const started = driver.start({
      harnessId: "demo" as never,
      cwd: "/tmp",
      env: {},
    })
    if (!started.ok) throw new Error("expected start ok")
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    const types = seen.map((e) => e.type)
    expect(types[0]).toBe("runner-started")
    expect(types).toContain("tool-call-started")
    expect(types).toContain("approval-requested")
    const subStart = seen.find(
      (e): e is Extract<CanonicalEvent, { type: "runner-started" }> =>
        e.type === "runner-started" && e.spawnedByCallId !== undefined,
    )
    expect(subStart?.spawnedByCallId).toBeDefined()
    expect(subStart?.parentRunnerId).toBe(demoScript.rootRunnerId)
  })
})
