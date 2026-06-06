import type { IpcClient, IpcError } from "@launchkit/ipc"
import type { SessionId } from "@launchkit/types"
import { type AppMode, AppShell, NewSessionModal } from "@launchkit/ui"
import type { NewSessionValues } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { useStore } from "zustand"
import { IpcClientProvider, useIpcClient } from "./IpcClientContext"
import { createRealClients } from "./clients"
import { useHarnesses } from "./hooks/useHarnesses"
import { useModels } from "./hooks/useModels"
import { useProviders } from "./hooks/useProviders"
import { useProxyStatus } from "./hooks/useProxyStatus"
import { useSessions } from "./hooks/useSessions"
import { StoreProvider, useStores } from "./stores/createStores"
import { type LocationAdapter, windowLocationAdapter } from "./stores/location"
import { encodeView } from "./stores/uiStore"
import type { CreateTerminal } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
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
   * The terminal transport client. Injected so tests run without an Electroview;
   * production builds the real one via `createRealClients` in `clients.ts`.
   */
  readonly terminalClient: TerminalClient
  /**
   * The xterm factory for terminal panes. Injected from `mount()` in production
   * (the real `createXterm`); tests pass a fake so xterm + its CSS never load.
   */
  readonly createTerminal: CreateTerminal
  /** Injected so the hash-sync effect is testable; defaults to window. */
  readonly location?: LocationAdapter
}

/** Props for the data-aware inner shell (rendered inside `IpcClientProvider`). */
type AppInnerProps = {
  readonly location: LocationAdapter
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}

/**
 * The stateful app body. Split out from `App` so its IPC hooks (e.g.
 * `useProxyStatus`) and the view factories' hooks all run INSIDE the
 * `IpcClientProvider` that `App` mounts.
 */
const AppInner = ({
  location,
  terminalClient,
  createTerminal,
}: AppInnerProps): ReactElement => {
  const client = useIpcClient()
  const uiStore = useStores().ui
  const view = useStore(uiStore, (s) => s.view)
  const openSessionIds = useStore(uiStore, (s) => s.openSessionIds)
  const modalOpen = useStore(uiStore, (s) => s.modalOpen)
  const navigate = useStore(uiStore, (s) => s.navigate)
  const openSession = useStore(uiStore, (s) => s.openSession)
  const closeSession = useStore(uiStore, (s) => s.closeSession)
  const setModalOpen = useStore(uiStore, (s) => s.setModalOpen)
  // A launch failure to surface inside the modal (so the user isn't left staring
  // at a silently-failed "New session"). Cleared when the modal (re)opens, on
  // cancel, and on a successful launch.
  const [launchError, setLaunchError] = useState<string | undefined>(undefined)
  // The cwd picked via the native folder dialog (fed into NewSessionModal).
  const [folder, setFolder] = useState<string>("")
  // The last harness/model launched, used to preselect the modal's selects.
  const [initialHarnessId, setInitialHarnessId] = useState<string>("")
  const [initialModelId, setInitialModelId] = useState<string>("")
  const proxy = useProxyStatus()

  // Prefill the New Session modal with the last launched folder/harness/model
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
      if (r.value.lastSelectedModelId !== "")
        setInitialModelId(r.value.lastSelectedModelId)
    })
    return () => {
      active = false
    }
  }, [client])

  // The session list lives here (not inside SessionsView) so a launch or an exit
  // can refetch it: a new running session must appear and an exited one must
  // move from Running to Recent. Two server-side queries: all running sessions
  // (pinned group) + a paginated page of ended sessions.
  const sessions = useSessions()
  const refetchSessions = sessions.refetch
  const runningSessions = sessions.running
  const recentSessions = sessions.recent
  const hasMore = sessions.hasMore

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
    const r = await sessions.launch({
      id: v.harnessId,
      ...(v.modelId !== undefined ? { modelId: v.modelId } : {}),
      ...(v.name.trim() ? { name: v.name } : {}),
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

  /**
   * A live session's pty exited: drop it from the open set so its dead live pane
   * unmounts (selecting it now renders the read-only replay), and refetch so the
   * master moves it from Running to Recent.
   */
  const onSessionExit = (id: SessionId): void => {
    closeSession(id)
    refetchSessions()
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
          running: runningSessions,
          recent: recentSessions,
          hasMore,
          onMore: sessions.loadMore,
          onSelect: (id) =>
            navigate({ kind: "sessions", selectedSessionId: id }),
          onNew: () => {
            harnesses.refetch()
            models.refetch()
            providers.refetch()
            setLaunchError(undefined)
            setModalOpen(true)
          },
          onExit: onSessionExit,
          terminalClient,
          createTerminal,
        })

  return (
    <>
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
        models={models.data ?? []}
        providerNames={providerNames}
        folder={folder}
        initialHarnessId={initialHarnessId}
        initialModelId={initialModelId}
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
  terminalClient,
  createTerminal,
  location = windowLocationAdapter,
}: AppProps): ReactElement => (
  <IpcClientProvider client={client}>
    <StoreProvider client={client} initialView={initialView}>
      <AppInner
        terminalClient={terminalClient}
        createTerminal={createTerminal}
        location={location}
      />
    </StoreProvider>
  </IpcClientProvider>
)

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = async (): Promise<void> => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startView = window.location.hash.replace(/^#/, "")
  // Dynamic import keeps xterm (and its CSS) out of the test module graph: the
  // test runner imports `App` directly and never calls `mount`.
  const { createXterm } = await import("./terminal/createXterm")
  // Build the ONE shared Electroview (carries IPC requests + the terminal pty
  // channel) and get both clients from it. See `clients.ts`.
  const { ipcClient, terminalClient } = await createRealClients()
  createRoot(container).render(
    <StrictMode>
      <App
        client={ipcClient}
        terminalClient={terminalClient}
        createTerminal={createXterm}
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
