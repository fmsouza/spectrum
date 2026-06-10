import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { createSqliteClient, runMigrations } from "@launchkit/db"
import { createSessionStore } from "@launchkit/sessions"
import type { SessionId } from "@launchkit/types"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
import { createRunStore } from "./store"

const make = () => {
  const opened = createSqliteClient(":memory:")
  if (!isOk(opened)) throw new Error("open failed")
  const client = opened.value
  expect(isOk(runMigrations(client))).toBe(true)
  const clock = createFixedClock(new Date("2026-06-08T10:00:00.000Z"))
  const idGen = createSequentialIdGen()
  const sessions = createSessionStore({ db: client, clock, idGen })
  const store = createRunStore({ db: client, clock })
  return { store, sessions }
}

/** Insert a session row (FK parent) and return its branded id. */
const seedSession = (
  sessions: ReturnType<typeof make>["sessions"],
): SessionId => {
  const created = sessions.create({
    harnessId: "demo" as never,
    projectId: "prj_x" as never,
    cwd: "/x",
  })
  if (!isOk(created)) throw new Error("seed session failed")
  return created.value.id
}

describe("createRunStore on drizzle", () => {
  it("appends the first event at seq 0 and stamps ts from the clock", () => {
    const { store, sessions } = make()
    const sid = seedSession(sessions)
    const event: CanonicalEvent = {
      type: "runner-started",
      runnerId: "rnr_root" as never,
    }
    const appended = store.append(sid, event)
    expect(isOk(appended) && appended.value).toEqual<false | { seq: number }>({
      seq: 0,
    })

    const read = store.read(sid)
    expect(isOk(read) && read.value).toEqual<false | readonly unknown[]>([
      {
        seq: 0,
        sessionId: sid,
        ts: "2026-06-08T10:00:00.000Z",
        event: { type: "runner-started", runnerId: "rnr_root" },
      },
    ])
  })

  it("assigns monotonically increasing seq across appends", () => {
    const { store, sessions } = make()
    const sid = seedSession(sessions)
    store.append(sid, { type: "runner-started", runnerId: "rnr_root" as never })
    store.append(sid, {
      type: "text-delta",
      runnerId: "rnr_root" as never,
      messageId: "m1",
      text: "hi",
    })
    const third = store.append(sid, {
      type: "runner-finished",
      runnerId: "rnr_root" as never,
      status: "completed",
    })
    expect(isOk(third) && third.value).toEqual<false | { seq: number }>({
      seq: 2,
    })

    const read = store.read(sid)
    expect(isOk(read) && read.value.map((e) => e.seq)).toEqual<
      false | readonly number[]
    >([0, 1, 2])
    expect(isOk(read) && read.value.map((e) => e.event.type)).toEqual<
      false | readonly string[]
    >(["runner-started", "text-delta", "runner-finished"])
  })

  it("isolates seq numbering per session", () => {
    const { store, sessions } = make()
    const a = seedSession(sessions)
    const b = seedSession(sessions)
    store.append(a, { type: "runner-started", runnerId: "rnr_a" as never })
    const onB = store.append(b, {
      type: "runner-started",
      runnerId: "rnr_b" as never,
    })
    expect(isOk(onB) && onB.value).toEqual<false | { seq: number }>({ seq: 0 })
    const readB = store.read(b)
    expect(isOk(readB) && readB.value.length).toBe(1)
  })

  it("returns an empty array when reading a session with no events", () => {
    const { store, sessions } = make()
    const sid = seedSession(sessions)
    const read = store.read(sid)
    expect(isOk(read) && read.value).toEqual<false | readonly unknown[]>([])
  })

  it("round-trips an opaque tool-call input/result through JSON payload", () => {
    const { store, sessions } = make()
    const sid = seedSession(sessions)
    store.append(sid, {
      type: "tool-call-finished",
      runnerId: "rnr_root" as never,
      callId: "c1",
      status: "ok",
      result: { nested: { ok: true }, list: [1, 2] },
    })
    const read = store.read(sid)
    if (!isOk(read)) throw new Error("read failed")
    const event = read.value[0]?.event
    expect(event?.type).toBe("tool-call-finished")
    expect(event && "result" in event ? event.result : undefined).toEqual({
      nested: { ok: true },
      list: [1, 2],
    })
  })
})
