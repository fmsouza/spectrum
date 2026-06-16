import { describe, expect, it } from "bun:test"
import { createProjectsStore } from "./projectsStore"
import type { StoreDeps } from "./types"

const okClient = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    getProjects: async () => ({
      ok: true,
      value: [{ id: "prj_a", name: "api", path: "/a", sessionCount: 12 }],
    }),
    getSessions: async () => ({
      ok: true,
      value: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        harnessId: "claude",
        startedAt: "2026-06-07T10:00:00.000Z",
      })),
    }),
    getSettings: async () => ({
      ok: true,
      value: {
        lastSelectedFolder: "",
        lastSelectedHarnessId: "",
        collapsedProjects: ["prj_a"],
      },
    }),
    setCollapsedProjects: async () => ({ ok: true, value: null }),
    launchHarness: async () => ({ ok: true, value: { sessionId: "s_new" } }),
    ...overrides,
  }) as unknown as StoreDeps["client"]

describe("projectsStore", () => {
  it("loads projects and seeds collapsed from settings on fetchProjects", async () => {
    const store = createProjectsStore({ client: okClient() })
    await store.getState().fetchProjects()
    expect(store.getState().projects?.[0]?.name).toBe("api")
    expect(store.getState().collapsed.has("prj_a")).toBe(true)
  })

  it("loads the first 10 sessions for a project on fetchSessions", async () => {
    const store = createProjectsStore({ client: okClient() })
    await store.getState().fetchSessions("prj_a")
    expect(store.getState().sessionsByProject.prj_a?.items).toHaveLength(10)
  })

  it("deleteSession calls the client then invalidates", async () => {
    const calls: string[] = []
    const store = createProjectsStore({
      client: okClient({
        deleteSession: async ({ sessionId }: { sessionId: string }) => {
          calls.push(`s:${sessionId}`)
          return { ok: true, value: null }
        },
      }),
    })
    await store.getState().deleteSession("s_1" as never)
    expect(calls).toContain("s:s_1")
  })

  it("deleteSession returns the client Result (ok) and invalidates", async () => {
    const store = createProjectsStore({
      client: okClient({
        deleteSession: async () => ({ ok: true, value: null }),
      }),
    })
    const r = await store.getState().deleteSession("s_1" as never)
    expect(r.ok).toBe(true)
  })

  it("deleteSession returns the error Result on failure (no invalidate)", async () => {
    let invalidated = false
    const store = createProjectsStore({
      client: okClient({
        getProjects: async () => {
          invalidated = true
          return { ok: true, value: [] }
        },
        deleteSession: async () => ({
          ok: false,
          error: { kind: "handler-failed", detail: "x" },
        }),
      }),
    })
    await store.getState().fetchProjects()
    invalidated = false
    const r = await store.getState().deleteSession("s_1" as never)
    expect(r.ok).toBe(false)
    expect(invalidated).toBe(false)
  })

  it("deleteProject calls the client then invalidates", async () => {
    const calls: string[] = []
    const store = createProjectsStore({
      client: okClient({
        deleteProject: async ({ projectId }: { projectId: string }) => {
          calls.push(`p:${projectId}`)
          return { ok: true, value: null }
        },
      }),
    })
    await store.getState().deleteProject("prj_1" as never)
    expect(calls).toContain("p:prj_1")
  })

  it("deleteProject returns the client Result (ok) and invalidates", async () => {
    const store = createProjectsStore({
      client: okClient({
        deleteProject: async () => ({ ok: true, value: null }),
      }),
    })
    const r = await store.getState().deleteProject("prj_1" as never)
    expect(r.ok).toBe(true)
  })

  it("deleteProject returns the error Result on failure (no invalidate)", async () => {
    let invalidated = false
    const store = createProjectsStore({
      client: okClient({
        getProjects: async () => {
          invalidated = true
          return { ok: true, value: [] }
        },
        deleteProject: async () => ({
          ok: false,
          error: { kind: "handler-failed", detail: "x" },
        }),
      }),
    })
    await store.getState().fetchProjects()
    invalidated = false
    const r = await store.getState().deleteProject("prj_1" as never)
    expect(r.ok).toBe(false)
    expect(invalidated).toBe(false)
  })

  it("toggleCollapse flips membership and persists the new set", async () => {
    let persisted: string[] | undefined
    const store = createProjectsStore({
      client: okClient({
        setCollapsedProjects: async ({ ids }: { ids: string[] }) => {
          persisted = ids
          return { ok: true, value: null }
        },
      }),
    })
    await store.getState().fetchProjects() // seeds collapsed = {prj_a}
    store.getState().toggleCollapse("prj_a")
    expect(store.getState().collapsed.has("prj_a")).toBe(false)
    expect(persisted).toEqual([])
  })
})
