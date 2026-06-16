import { describe, expect, it } from "bun:test"
import type { SessionId } from "@spectrum/types"
import type { CanonicalEvent } from "./events"
import type { RunnerId } from "./index"
import {
  type RootRunnerMap,
  isRootRunnerFinished,
  trackRootRunner,
} from "./root-runner"

const session = "sess-1" as SessionId
const root = "root-1" as RunnerId
const child = "child-1" as RunnerId

const started = (
  runnerId: RunnerId,
  parentRunnerId?: RunnerId,
): CanonicalEvent => ({
  type: "runner-started",
  runnerId,
  ...(parentRunnerId !== undefined ? { parentRunnerId } : {}),
})

const finished = (runnerId: RunnerId): CanonicalEvent => ({
  type: "runner-finished",
  runnerId,
  status: "completed",
})

describe("trackRootRunner", () => {
  it("records the root when a parentless runner-started arrives", () => {
    const next = trackRootRunner(new Map(), session, started(root))
    expect(next.get(session)).toBe(root)
  })

  it("does NOT record a root when a child runner-started arrives", () => {
    const next = trackRootRunner(new Map(), session, started(child, root))
    expect(next.has(session)).toBe(false)
  })

  it("does NOT overwrite an existing root with a second parentless start", () => {
    const seeded: RootRunnerMap = new Map([[session, root]])
    const other = "root-2" as RunnerId
    const next = trackRootRunner(seeded, session, started(other))
    expect(next.get(session)).toBe(root)
  })

  it("returns the same map (identity) when nothing is recorded", () => {
    const seeded: RootRunnerMap = new Map([[session, root]])
    expect(trackRootRunner(seeded, session, started(root))).toBe(seeded)
    expect(trackRootRunner(seeded, session, finished(root))).toBe(seeded)
    expect(trackRootRunner(seeded, session, started(child, root))).toBe(seeded)
  })
})

describe("isRootRunnerFinished", () => {
  const roots: RootRunnerMap = new Map([[session, root]])

  it("is true for the root runner's runner-finished", () => {
    expect(isRootRunnerFinished(roots, session, finished(root))).toBe(true)
  })

  it("is false for a sub-runner's runner-finished", () => {
    expect(isRootRunnerFinished(roots, session, finished(child))).toBe(false)
  })

  it("is false for a non-finished event", () => {
    expect(isRootRunnerFinished(roots, session, started(root))).toBe(false)
  })

  it("is false (fail-closed) when the session has no recorded root", () => {
    expect(isRootRunnerFinished(new Map(), session, finished(root))).toBe(false)
  })
})
