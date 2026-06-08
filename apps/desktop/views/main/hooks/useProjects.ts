import type { IpcError, IpcMethods } from "@launchkit/ipc"
import type { Session } from "@launchkit/types"
import type { Result } from "@launchkit/utils"
import { useEffect } from "react"
import { useStore } from "zustand"
import { useStores } from "../stores/createStores"

type LaunchInput = IpcMethods["launchHarness"]["params"]
type LaunchResult = IpcMethods["launchHarness"]["result"]
type ProjectSummary = IpcMethods["getProjects"]["result"][number]

export type UseProjects = {
  readonly projects: readonly ProjectSummary[]
  readonly sessionsByProject: Readonly<Record<string, readonly Session[]>>
  /** All loaded sessions across projects, for resolving the selected one in the detail pane. */
  readonly allSessions: readonly Session[]
  readonly collapsed: ReadonlySet<string>
  readonly loading: boolean
  readonly error: IpcError | undefined
  readonly toggleCollapse: (projectId: string) => void
  readonly loadMore: (projectId: string) => void
  readonly refetch: () => void
  readonly launch: (
    input: LaunchInput,
  ) => Promise<Result<LaunchResult, IpcError>>
}

export const useProjects = (): UseProjects => {
  const store = useStores().projects
  const projects = useStore(store, (s) => s.projects)
  const sessionsByProjectRaw = useStore(store, (s) => s.sessionsByProject)
  const collapsed = useStore(store, (s) => s.collapsed)
  const loading = useStore(store, (s) => s.loadingProjects)
  const error = useStore(store, (s) => s.errorProjects)
  const fetchProjects = useStore(store, (s) => s.fetchProjects)
  const fetchSessions = useStore(store, (s) => s.fetchSessions)
  const loadMore = useStore(store, (s) => s.loadMore)
  const toggleCollapse = useStore(store, (s) => s.toggleCollapse)
  const invalidate = useStore(store, (s) => s.invalidate)
  const launch = useStore(store, (s) => s.launch)

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  const projectList = projects ?? []
  useEffect(() => {
    for (const p of projectList) {
      if (!collapsed.has(p.id)) void fetchSessions(p.id)
    }
  }, [projectList, collapsed, fetchSessions])

  const sessionsByProject: Record<string, readonly Session[]> = {}
  for (const [id, page] of Object.entries(sessionsByProjectRaw))
    sessionsByProject[id] = page.items
  const allSessions = Object.values(sessionsByProject).flat()

  return {
    projects: projectList,
    sessionsByProject,
    allSessions,
    collapsed,
    loading,
    error,
    toggleCollapse,
    loadMore,
    refetch: () => void invalidate(),
    launch,
  }
}
