import { describe, expect, it } from "bun:test"
import {
  createSqliteClient,
  projects,
  runEvents,
  runMigrations,
  sessions,
} from "@spectrum/db"
import { createRunStore } from "@spectrum/run-store"
import { createSessionStore } from "@spectrum/sessions"
import type { ProjectId, SessionId } from "@spectrum/types"
import { createFixedClock, createSequentialIdGen, isOk } from "@spectrum/utils"
import { eq } from "drizzle-orm"
import { createDataAdmin } from "./store"

const make = () => {
  const opened = createSqliteClient(":memory:")
  if (!isOk(opened)) throw new Error("open failed")
  const db = opened.value
  expect(isOk(runMigrations(db))).toBe(true)
  const clock = createFixedClock(new Date("2026-06-08T10:00:00.000Z"))
  const idGen = createSequentialIdGen()
  const sessionStore = createSessionStore({ db, clock, idGen })
  const runStore = createRunStore({ db, clock })
  const admin = createDataAdmin({ db })
  return { db, sessionStore, runStore, admin }
}

const seedSession = (
  sessionStore: ReturnType<typeof make>["sessionStore"],
  projectId: string,
): SessionId => {
  const created = sessionStore.create({
    harnessId: "demo" as never,
    projectId: projectId as ProjectId,
    cwd: "/x",
  })
  if (!isOk(created)) throw new Error("seed session failed")
  return created.value.id
}

const eventCount = (
  db: ReturnType<typeof make>["db"],
  sid: SessionId,
): number =>
  db.handle.select().from(runEvents).where(eq(runEvents.sessionId, sid)).all()
    .length

const sessionExists = (
  db: ReturnType<typeof make>["db"],
  sid: SessionId,
): boolean =>
  db.handle.select().from(sessions).where(eq(sessions.id, sid)).get() !==
  undefined

const projectExists = (
  db: ReturnType<typeof make>["db"],
  pid: string,
): boolean =>
  db.handle.select().from(projects).where(eq(projects.id, pid)).get() !==
  undefined

/** Insert a project row directly (find-or-create needs a real path; here we control the id). */
const seedProject = (db: ReturnType<typeof make>["db"], id: string): void => {
  db.handle
    .insert(projects)
    .values({
      id,
      name: id,
      path: `/${id}`,
      createdAt: "2026-06-08T10:00:00.000Z",
    })
    .run()
}

describe("createDataAdmin.deleteSession", () => {
  it("removes the session and all its run events when given a session id", () => {
    const { db, sessionStore, runStore, admin } = make()
    const sid = seedSession(sessionStore, "prj_a")
    runStore.append(sid, { type: "runner-started", runnerId: "r" as never })
    runStore.append(sid, {
      type: "runner-finished",
      runnerId: "r" as never,
      status: "completed",
    })

    const result = admin.deleteSession(sid)

    expect(isOk(result)).toBe(true)
    expect(sessionExists(db, sid)).toBe(false)
    expect(eventCount(db, sid)).toBe(0)
  })

  it("leaves sibling sessions and their events untouched when deleting one session", () => {
    const { db, sessionStore, runStore, admin } = make()
    const target = seedSession(sessionStore, "prj_a")
    const sibling = seedSession(sessionStore, "prj_a")
    runStore.append(sibling, { type: "runner-started", runnerId: "r" as never })

    admin.deleteSession(target)

    expect(sessionExists(db, sibling)).toBe(true)
    expect(eventCount(db, sibling)).toBe(1)
  })

  it("returns ok with no change when the session id does not exist", () => {
    const { db, admin } = make()
    const result = admin.deleteSession("s_missing" as SessionId)
    expect(isOk(result)).toBe(true)
    expect(sessionExists(db, "s_missing" as SessionId)).toBe(false)
  })
})

describe("createDataAdmin.deleteProject", () => {
  it("removes the project, its sessions, and all their run events", () => {
    const { db, sessionStore, runStore, admin } = make()
    seedProject(db, "prj_a")
    const s1 = seedSession(sessionStore, "prj_a")
    const s2 = seedSession(sessionStore, "prj_a")
    runStore.append(s1, { type: "runner-started", runnerId: "r" as never })
    runStore.append(s2, { type: "runner-started", runnerId: "r" as never })

    const result = admin.deleteProject("prj_a" as ProjectId)

    expect(isOk(result)).toBe(true)
    expect(projectExists(db, "prj_a")).toBe(false)
    expect(sessionExists(db, s1)).toBe(false)
    expect(sessionExists(db, s2)).toBe(false)
    expect(eventCount(db, s1)).toBe(0)
    expect(eventCount(db, s2)).toBe(0)
  })

  it("leaves a sibling project and its sessions untouched", () => {
    const { db, sessionStore, runStore, admin } = make()
    seedProject(db, "prj_a")
    seedProject(db, "prj_b")
    const a = seedSession(sessionStore, "prj_a")
    const b = seedSession(sessionStore, "prj_b")
    runStore.append(b, { type: "runner-started", runnerId: "r" as never })

    admin.deleteProject("prj_a" as ProjectId)

    expect(projectExists(db, "prj_b")).toBe(true)
    expect(sessionExists(db, b)).toBe(true)
    expect(sessionExists(db, a)).toBe(false)
    expect(eventCount(db, b)).toBe(1)
  })

  it("returns ok with no change when the project id does not exist", () => {
    const { db, admin } = make()
    const result = admin.deleteProject("prj_missing" as ProjectId)
    expect(isOk(result)).toBe(true)
    expect(projectExists(db, "prj_missing")).toBe(false)
  })
})
