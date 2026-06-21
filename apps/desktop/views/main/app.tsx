import {
  type RootRunnerMap,
  isRootRunnerFinished,
  trackRootRunner,
} from "@spectrum/agent-events"
import type { IpcClient, IpcError } from "@spectrum/ipc"
import type { ProjectId } from "@spectrum/types"
import {
  type AppMode,
  AppShell,
  NewSessionModal,
  ToastContainer,
} from "@spectrum/ui"
import type { NewSessionValues } from "@spectrum/ui"
import {
  type ReactElement,
  StrictMode,
  useEffect,
  useRef,
  useState,
} from "react"
import { createRoot } from "react-dom/client"
import { useStore } from "zustand"
import { IpcClientProvider, useIpcClient } from "./IpcClientContext"
import { LoggerProvider } from "./LoggerContext"
import { createRealClients } from "./clients"
import { UpdateBanner } from "./components/UpdateBanner"
import { useHarnesses } from "./hooks/useHarnesses"
import { useModels } from "./hooks/useModels"
import { useNotifications } from "./hooks/useNotifications"
import { useProjects } from "./hooks/useProjects"
import { useProviders } from "./hooks/useProviders"
import { useProxyStatus } from "./hooks/useProxyStatus"
import { useUpdate } from "./hooks/useUpdate"
import { createWebviewLogger } from "./logger"
import type { RunnerClient } from "./runner/runnerClient"
import { StoreProvider, useStores } from "./stores/createStores"
import { type LocationAdapter, windowLocationAdapter } from "./stores/location"
import { encodeView } from "./stores/uiStore"
import { SessionsView } from "./views/SessionsView"
import { SettingsView } from "./views/SettingsView"

export type { View } from "./stores/uiStore"

/**
 * Derive a readable, message-safe string from an `IpcError` for the modal alert.
 * Uses the typed `detail` (the only message-bearing field — no stack/secrets),
 * falling back to the `kind` when a handler returned no detail.
 */
const ipcErrorMessage = (prefix: string, error: IpcError): string =>
  error.detail.trim() === ""
    ? `${prefix} (${error.kind}).`
    : `${prefix}: ${error.detail}`

export type AppProps = {
  readonly client: IpcClient
  /** The initial view, as a raw hash string (e.g. `settings/providers`). */
  readonly initialView?: string
  /**
   * The runner transport client for native harness sessions. Injected so tests
   * run without a real WebSocket; production builds the real one via
   * `createRealClients` in `clients.ts`.
   */
  readonly runnerClient: RunnerClient
  /** Injected so the hash-sync effect is testable; defaults to window. */
  readonly location?: LocationAdapter
}

/** Props for the data-aware inner shell (rendered inside `IpcClientProvider`). */
type AppInnerProps = {
  readonly location: LocationAdapter
  readonly runnerClient: RunnerClient
}

/**
 * The stateful app body. Split out from `App` so its IPC hooks (e.g.
 * `useProxyStatus`) and the view factories' hooks all run INSIDE the
 * `IpcClientProvider` that `App` mounts.
 */
const AppInner = ({ location, runnerClient }: AppInnerProps): ReactElement => {
  const client = useIpcClient()
  const uiStore = useStores().ui
  const view = useStore(uiStore, (s) => s.view)
  const openSessionIds = useStore(uiStore, (s) => s.openSessionIds)
  const modalOpen = useStore(uiStore, (s) => s.modalOpen)
  const navigate = useStore(uiStore, (s) => s.navigate)
  const openSession = useStore(uiStore, (s) => s.openSession)
  const setModalOpen = useStore(uiStore, (s) => s.setModalOpen)
  // A launch failure to surface inside the modal (so the user isn't left staring
  // at a silently-failed "New session"). Cleared when the modal (re)opens, on
  // cancel, and on a successful launch.
  const [launchError, setLaunchError] = useState<string | undefined>(undefined)
  // The cwd picked via the native folder dialog (fed into NewSessionModal).
  const [folder, setFolder] = useState<string>("")
  // The last harness launched, used to preselect the modal's select. The
  // composer's model selector persists per-harness directly (no modal state).
  const [initialHarnessId, setInitialHarnessId] = useState<string>("")
  const proxy = useProxyStatus()
  const update = useUpdate()
  const notifications = useNotifications()

  // Prefill the New Session modal with the last launched folder/harness
  // (persisted by a successful launch). Page-level fetch — the modal stays dumb
  // and just receives the resolved props.
  useEffect(() => {
    let active = true
    void client.getSettings(undefined).then((r) => {
      if (!active || !r.ok) return
      if (r.value.lastSelectedFolder !== "")
        setFolder(r.value.lastSelectedFolder)
      if (r.value.lastSelectedHarnessId !== "")
        setInitialHarnessId(r.value.lastSelectedHarnessId)
    })
    return () => {
      active = false
    }
  }, [client])

  // The projects/sessions list lives here (not inside SessionsView) so a launch
  // can refetch it: a new running session must appear in the right project group.
  const projectsView = useProjects()

  // Feed the new-session modal. These hooks load lazily and stay cheap when the
  // modal is closed (the data is just handed to a dumb component).
  const harnesses = useHarnesses()
  const models = useModels()
  const providers = useProviders()

  const providerNames: Record<string, string> = {}
  for (const p of providers.data ?? []) providerNames[p.id] = p.name

  // Keep the URL hash in sync so reloads land on the same view (no remote nav).
  useEffect(() => {
    location.writeHash(encodeView(view))
  }, [view, location])

  // Track each session's ROOT runner (the first parentless `runner-started`) across the firehose.
  // A multi-agent run emits one `runner-finished` per runner — sub-agents AND the root — so we must
  // toast ONLY on the root finish, never mid-run on a sub-agent. A ref (not state) survives the
  // effect re-subscription below (which re-runs on `view` change) so accumulated roots are retained.
  const rootsRef = useRef<RootRunnerMap>(new Map())

  // `notify` is a referentially STABLE zustand store action (its identity never changes), unlike the
  // `notifications` object literal which is fresh each render. Depend on `notify` below so the effect
  // re-subscribes only on intended changes (view/runnerClient/navigate), not on every re-render.
  const notify = notifications.notify

  // Live session-name pushes (auto-derived/harness title mid-run). Updates the cached
  // session in place; the persisted name is the source of truth and is already written by the
  // RunManager. No toast — this is a quiet background refresh of the list.
  const updateSessionName = projectsView.updateSessionName
  useEffect(() => {
    const off = runnerClient.onSessionRenamed((id, name) => {
      updateSessionName(id, name)
    })
    return off
  }, [runnerClient, updateSessionName])

  // Toast when a BACKGROUND run finishes/errors (not the session being viewed).
  // `onAny` accumulates listeners, so the effect MUST drop its previous one via
  // the returned unsubscribe fn on every re-run — otherwise toasts would stack.
  useEffect(() => {
    const off = runnerClient.onAny((id, stored) => {
      const ev = stored.event
      // Update the root map on EVERY frame so a later runner-finished can be classified.
      rootsRef.current = trackRootRunner(rootsRef.current, id, ev)
      if (ev.type !== "runner-finished") return
      if (ev.status === "interrupted") return
      // Fail-closed: suppress unless this finish is for the session's recorded ROOT runner.
      if (!isRootRunnerFinished(rootsRef.current, id, ev)) return
      const isViewing =
        view.kind === "sessions" && view.selectedSessionId === id
      if (isViewing) return
      const action = {
        label: "View",
        onClick: () => navigate({ kind: "sessions", selectedSessionId: id }),
      }
      notify(
        ev.status === "errored"
          ? { tone: "error", message: "A run failed", action }
          : { tone: "info", message: "A run finished", action },
      )
    })
    return off
  }, [runnerClient, view, notify, navigate])

  const mode: AppMode = view.kind === "settings" ? "settings" : "sessions"

  const onModeChange = (next: AppMode): void =>
    navigate(
      next === "settings"
        ? { kind: "settings", section: "general" }
        : { kind: "sessions" },
    )

  const onBrowse = async (): Promise<void> => {
    const r = await client.pickFolder({})
    if (!r.ok) {
      setLaunchError(
        ipcErrorMessage("Couldn't open the folder picker", r.error),
      )
      return
    }
    if (r.value.path !== undefined && r.value.path !== "")
      setFolder(r.value.path)
  }

  const onSubmitNewSession = async (v: NewSessionValues): Promise<void> => {
    // Omit empty name/cwd so they're never sent as "" — the IPC `name` schema
    // accepts "" but a session created with name:"" then fails SessionSchema's
    // min(1) on the next getSessions, and an empty cwd is meaningless.
    // Model selection lives in the composer (per-harness prefs); the modal does
    // not carry a model id.
    const r = await projectsView.launch({
      id: v.harnessId,
      ...(v.name !== undefined && v.name.trim() !== "" ? { name: v.name } : {}),
      ...(v.cwd.trim() ? { cwd: v.cwd } : {}),
      env: v.env,
    })
    if (!r.ok) {
      // Surface the failure in the modal (keep it open) instead of swallowing it.
      setLaunchError(ipcErrorMessage("Could not launch session", r.error))
      return
    }
    setLaunchError(undefined)
    const id = r.value.sessionId
    openSession(id)
    navigate({ kind: "sessions", selectedSessionId: id })
    setModalOpen(false)
    // sessions.launch already invalidates both groups on success.
  }

  const { master, detail } =
    view.kind === "settings"
      ? SettingsView({
          section: view.section,
          onSection: (key) => navigate({ kind: "settings", section: key }),
        })
      : SessionsView({
          ...(view.selectedSessionId === undefined
            ? {}
            : { selectedSessionId: view.selectedSessionId }),
          openSessionIds,
          projects: projectsView.projects,
          sessionsByProject: projectsView.sessionsByProject,
          collapsed: projectsView.collapsed,
          allSessions: projectsView.allSessions,
          onToggle: projectsView.toggleCollapse,
          onMore: projectsView.loadMore,
          onSelect: (id) =>
            navigate({ kind: "sessions", selectedSessionId: id }),
          onNew: () => {
            harnesses.refetch()
            models.refetch()
            providers.refetch()
            setLaunchError(undefined)
            setModalOpen(true)
          },
          onDeleteProject: (projectId) => {
            // If the selected session belonged to this project it simply
            // vanishes from the refetched lists; SessionsDetail already renders
            // the empty state when the session isn't found, so no extra
            // selection handling is needed here.
            void (async () => {
              const r = await projectsView.deleteProject(projectId as ProjectId)
              if (r.ok)
                notifications.notify({
                  tone: "success",
                  message: "Project deleted",
                })
              else
                notifications.notify({
                  tone: "error",
                  message: "Couldn't delete the project",
                  action: {
                    label: "Retry",
                    onClick: () =>
                      void projectsView.deleteProject(projectId as ProjectId),
                  },
                })
            })()
          },
          onDeleteSession: (sessionId) => {
            void (async () => {
              const r = await projectsView.deleteSession(sessionId)
              if (r.ok) {
                notifications.notify({
                  tone: "success",
                  message: "Session deleted",
                })
                // If the open detail pane was showing this session, drop the selection.
                if (
                  view.kind === "sessions" &&
                  view.selectedSessionId === sessionId
                )
                  navigate({ kind: "sessions" })
              } else {
                notifications.notify({
                  tone: "error",
                  message: "Couldn't delete the session",
                  action: {
                    label: "Retry",
                    onClick: () => void projectsView.deleteSession(sessionId),
                  },
                })
              }
            })()
          },
          onRename: (id, name) => {
            void (async () => {
              const r = await projectsView.renameSession(id, name)
              if (!r.ok)
                notifications.notify({
                  tone: "error",
                  message: "Could not rename session",
                })
            })()
          },
          runnerClient,
          models: models.data ?? [],
          providerNames,
        })

  return (
    <>
      <UpdateBanner
        state={update.state}
        onDownload={update.download}
        onRestart={update.apply}
        onDismiss={update.dismiss}
      />
      <ToastContainer
        notifications={notifications.notifications}
        onDismiss={notifications.dismiss}
      />
      <AppShell
        mode={mode}
        onModeChange={onModeChange}
        proxyRunning={proxy.data?.running ?? false}
        proxyPort={proxy.data?.port}
        master={master}
        detail={detail}
      />
      <NewSessionModal
        open={modalOpen}
        harnesses={harnesses.data ?? []}
        folder={folder}
        initialHarnessId={initialHarnessId}
        {...(launchError === undefined ? {} : { error: launchError })}
        onBrowse={() => void onBrowse()}
        onSubmit={(v) => void onSubmitNewSession(v)}
        onCancel={() => {
          setLaunchError(undefined)
          setModalOpen(false)
        }}
      />
    </>
  )
}

export const App = ({
  client,
  initialView = "sessions",
  runnerClient,
  location = windowLocationAdapter,
}: AppProps): ReactElement => {
  const log = createWebviewLogger({ forward: (p) => client.logClientError(p) })
  return (
    <IpcClientProvider client={client}>
      <LoggerProvider logger={log}>
        <StoreProvider client={client} initialView={initialView}>
          <AppInner runnerClient={runnerClient} location={location} />
        </StoreProvider>
      </LoggerProvider>
    </IpcClientProvider>
  )
}

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = async (): Promise<void> => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startView = window.location.hash.replace(/^#/, "")
  // Build the ONE shared Electroview (carries IPC requests + the runner socket)
  // and get all clients from it. See `clients.ts`.
  const { ipcClient, runnerClient } = await createRealClients()
  createRoot(container).render(
    <StrictMode>
      <App
        client={ipcClient}
        runnerClient={runnerClient}
        initialView={startView}
      />
    </StrictMode>,
  )
}

// Auto-mount only in the real webview (a DOM with #root), never under the test
// runner (which imports `App` directly and renders it with a fake client).
if (
  typeof document !== "undefined" &&
  document.getElementById("root") !== null
) {
  void mount()
}
