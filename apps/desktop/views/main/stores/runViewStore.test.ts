import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { RunnerIdSchema, SessionIdSchema } from "@launchkit/types"
import { createRunViewStore } from "./runViewStore"

const sid = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")
const root = RunnerIdSchema.parse("run_root")
const child = RunnerIdSchema.parse("run_child")

const noDeps = { client: {} as never }

describe("runViewStore", () => {
  it("folds a runner-started event into a RunState for the session", () => {
    const store = createRunViewStore(noDeps)
    const ev: CanonicalEvent = { type: "runner-started", runnerId: root }
    store.getState().applyEvent(sid, ev)
    const state = store.getState().byId[sid]
    expect(state?.rootRunnerId).toBe(root)
    expect(state?.runners.get(root)?.status).toBe("running")
  })

  it("accumulates a text-delta onto the runner's message item", () => {
    const store = createRunViewStore(noDeps)
    const events: readonly CanonicalEvent[] = [
      { type: "runner-started", runnerId: root },
      { type: "text-delta", runnerId: root, messageId: "m1", text: "Hel" },
      { type: "text-delta", runnerId: root, messageId: "m1", text: "lo" },
    ]
    for (const e of events) store.getState().applyEvent(sid, e)
    const item = store.getState().byId[sid]?.runners.get(root)?.items[0]
    expect(item?.kind).toBe("message")
    expect(item?.kind === "message" ? item.text : "").toBe("Hello")
  })

  it("reset clears a session's RunState", () => {
    const store = createRunViewStore(noDeps)
    store.getState().applyEvent(sid, { type: "runner-started", runnerId: root })
    store.getState().reset(sid)
    expect(store.getState().byId[sid]).toBeUndefined()
  })

  it("tracks busy: a user turn sets it; the root turn/runner finishing clears it", () => {
    const store = createRunViewStore(noDeps)
    const apply = (e: CanonicalEvent): void =>
      store.getState().applyEvent(sid, e)
    apply({ type: "runner-started", runnerId: root })
    expect(store.getState().busyBySession[sid] ?? false).toBe(false)
    apply({
      type: "text-delta",
      runnerId: root,
      messageId: "u1",
      text: "go",
      role: "user",
    })
    expect(store.getState().busyBySession[sid]).toBe(true)
    apply({ type: "text-delta", runnerId: root, messageId: "a1", text: "ok" })
    expect(store.getState().busyBySession[sid]).toBe(true)
    // a sub-runner finishing must NOT clear the root's busy
    apply({ type: "runner-finished", runnerId: child, status: "completed" })
    expect(store.getState().busyBySession[sid]).toBe(true)
    apply({ type: "turn-finished", runnerId: root })
    expect(store.getState().busyBySession[sid]).toBe(false)
  })

  it("openSub records the open sub-runner and closeSub clears it", () => {
    const store = createRunViewStore(noDeps)
    store.getState().openSub(sid, child)
    expect(store.getState().openSubBySession[sid]).toBe(child)
    store.getState().closeSub(sid)
    expect(store.getState().openSubBySession[sid]).toBeUndefined()
  })

  it("stores the selected mode per session and clears it on reset", () => {
    const store = createRunViewStore(noDeps)
    store.getState().setMode(sid, "bypass")
    expect(store.getState().modeBySession[sid]).toBe("bypass")
    store.getState().reset(sid)
    expect(store.getState().modeBySession[sid]).toBeUndefined()
  })
})
