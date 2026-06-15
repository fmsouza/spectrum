import type { IpcError, IpcMethods } from "@spectrum/ipc"
import type { ProjectId, Session, SessionId } from "@spectrum/types"
import type { Result } from "@spectrum/utils"
import { type StoreApi, createStore } from "zustand/vanilla"
import type { StoreDeps } from "./types"

type LaunchInput = IpcMethods["launchHarness"]["params"]
type LaunchResult = IpcMethods["launchHarness"]["result"]
type ProjectSummary = IpcMethods["getProjects"]["result"][number]

/** How many sessions are loaded per page, per project. */
export const PROJECT_PAGE_SIZE = 10

type ProjectSessions = {
  readonly items: readonly Session[]
  readonly limit: number
}

export type ProjectsStore = {
  readonly projects: readonly ProjectSummary[] | undefined
  readonly sessionsByProject: Readonly<Record<string, ProjectSessions>>
  readonly collapsed: ReadonlySet<string>
  readonly loadingProjects: boolean
  readonly errorProjects: IpcError | undefined
  readonly fetchProjects: () => Promise<void>
  readonly fetchSessions: (projectId: string) => Promise<void>
  readonly loadMore: (projectId: string) => void
  readonly toggleCollapse: (projectId: string) => void
  readonly invalidate: () => Promise<void>
  readonly launch: (
    input: LaunchInput,
  ) => Promise<Result<LaunchResult, IpcError>>
  readonly deleteSession: (id: SessionId) => Promise<void>
  readonly deleteProject: (id: ProjectId) => Promise<void>
}

export const createProjectsStore = (deps: StoreDeps): StoreApi<ProjectsStore> =>
  createStore<ProjectsStore>()((set, get) => {
    let collapsedSeeded = false

    const loadProjects = async (): Promise<void> => {
      set({ loadingProjects: true })
      const r = await deps.client.getProjects(undefined)
      if (!r.ok) {
        set({ errorProjects: r.error, loadingProjects: false })
        return
      }
      if (!collapsedSeeded) {
        collapsedSeeded = true
        const s = await deps.client.getSettings(undefined)
        if (s.ok) set({ collapsed: new Set(s.value.collapsedProjects) })
      }
      set({
        projects: r.value,
        errorProjects: undefined,
        loadingProjects: false,
      })
    }

    const loadSessions = async (projectId: string): Promise<void> => {
      const limit =
        get().sessionsByProject[projectId]?.limit ?? PROJECT_PAGE_SIZE
      const r = await deps.client.getSessions({
        projectId: projectId as ProjectId,
        limit,
      })
      if (!r.ok) {
        set({ errorProjects: r.error })
        return
      }
      set((state) => ({
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectId]: { items: r.value, limit },
        },
      }))
    }

    return {
      projects: undefined,
      sessionsByProject: {},
      collapsed: new Set<string>(),
      loadingProjects: false,
      errorProjects: undefined,

      fetchProjects: () =>
        get().projects !== undefined ? Promise.resolve() : loadProjects(),

      fetchSessions: (projectId) =>
        get().sessionsByProject[projectId] !== undefined
          ? Promise.resolve()
          : loadSessions(projectId),

      loadMore: (projectId) => {
        const current = get().sessionsByProject[projectId]
        const nextLimit =
          (current?.limit ?? PROJECT_PAGE_SIZE) + PROJECT_PAGE_SIZE
        set((state) => ({
          sessionsByProject: {
            ...state.sessionsByProject,
            [projectId]: { items: current?.items ?? [], limit: nextLimit },
          },
        }))
        void loadSessions(projectId)
      },

      toggleCollapse: (projectId) => {
        const next = new Set(get().collapsed)
        if (next.has(projectId)) next.delete(projectId)
        else next.add(projectId)
        set({ collapsed: next })
        void deps.client.setCollapsedProjects({ ids: [...next] })
      },

      invalidate: async () => {
        set({ projects: undefined, sessionsByProject: {} })
        await loadProjects()
      },

      launch: async (input) => {
        const r = await deps.client.launchHarness(input)
        if (r.ok) await get().invalidate()
        return r
      },

      deleteSession: async (id) => {
        const r = await deps.client.deleteSession({ sessionId: id })
        if (r.ok) await get().invalidate()
      },

      deleteProject: async (id) => {
        const r = await deps.client.deleteProject({ projectId: id })
        if (r.ok) await get().invalidate()
      },
    }
  })
