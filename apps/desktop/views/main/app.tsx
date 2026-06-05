import type { IpcClient, IpcError } from "@launchkit/ipc"
import type { SessionId } from "@launchkit/types"
import { type AppMode, AppShell, NewSessionModal } from "@launchkit/ui"
import type { NewSessionValues } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { IpcClientProvider, useIpcClient } from "./IpcClientContext"
import { createRealClients } from "./clients"
import { useHarnesses } from "./hooks/useHarnesses"
import { useModels } from "./hooks/useModels"
import { useProfiles } from "./hooks/useProfiles"
import { useProviders } from "./hooks/useProviders"
import { useProxyStatus } from "./hooks/useProxyStatus"
import { useSessions } from "./hooks/useSessions"
import { StoreProvider } from "./stores/createStores"
import type { CreateTerminal } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
import { SessionsView } from "./views/SessionsView"
import { SettingsView } from "./views/SettingsView"

/**
 * The top-level app view. `sessions` carries the optionally-selected session id;
 * `settings` carries the active section key. Serialized to the URL hash so a
 * reload lands on the same place (no remote navigation).
 */
export type View =
  | { readonly kind: "sessions"; readonly selectedSessionId?: SessionId }
  | { readonly kind: "settings"; readonly section: string }

/** Parse a raw hash (e.g. `#settings/providers`) into a `View`. */
const parseView = (raw: string): View => {
  const [kind, rest] = raw.replace(/^#/, "").split("/", 2)
  if (kind === "settings")
    return { kind: "settings", section: rest ?? "general" }
  if (kind === "sessions")
    return rest === undefined || rest === ""
      ? { kind: "sessions" }
      : { kind: "sessions", selectedSessionId: rest as SessionId }
  // Anything else (incl. the retired #dashboard) collapses to the default sessions view.
  return { kind: "sessions" }
}

/**
 * Derive a readable, message-safe string from an `IpcError` for the modal alert.
 * Uses the typed `detail` (the only message-bearing field — no stack/secrets),
 * falling back to the `kind` when a handler returned no detail.
 */
const ipcErrorMessage = (prefix: string, error: IpcError): string =>
  error.detail.trim() === ""
    ? `${prefix} (${error.kind}).`
    : `${prefix}: ${error.detail}`

/** Encode a `View` back to its hash representation. */
const encodeView = (view: View): string =>
  view.kind === "settings"
    ? `#settings/${view.section}`
    : view.selectedSessionId === undefined
      ? "#sessions"
      : `#sessions/${view.selectedSessionId}`

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
}

/** Props for the data-aware inner shell (rendered inside `IpcClientProvider`). */
type AppInnerProps = {
  readonly initialView: string
  readonly terminalClient: TerminalClient
  readonly createTerminal: CreateTerminal
}

/**
 * The stateful app body. Split out from `App` so its IPC hooks (e.g.
 * `useProxyStatus`) and the view factories' hooks all run INSIDE the
 * `IpcClientProvider` that `App` mounts.
 */
const AppInner = ({
  initialView,
  terminalClient,
  createTerminal,
}: AppInnerProps): ReactElement => {
  const client = useIpcClient()
  const [view, setView] = useState<View>(parseView(initialView))
  // Open live sessions stay mounted (hidden) keyed by id so xterm scrollback
  // survives selection changes; never auto-removed (the old tab behaviour).
  const [openSessionIds, setOpenSessionIds] = useState<readonly SessionId[]>([])
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  // A launch failure to surface inside the modal (so the user isn't left staring
  // at a silently-failed "New session"). Cleared when the modal (re)opens, on
  // cancel, and on a successful launch.
  const [launchError, setLaunchError] = useState<string | undefined>(undefined)
  // The cwd picked via the native folder dialog (fed into NewSessionModal).
  const [folder, setFolder] = useState<string>("")
  const proxy = useProxyStatus()

  // The session list lives here (not inside SessionsView) so a launch or an exit
  // can refetch it: a new running session must appear and an exited one must
  // move from Running to Recent. Two server-side queries: all running sessions
  // (pinned group) + a paginated page of ended sessions. `useSessions`
  // auto-refetches when its filter changes (the filter is in the
  // useCallback/useAsyncResource dep), so bumping `recentLimit` reloads `recent`.
  const running = useSessions({ running: true })
  const [recentLimit, setRecentLimit] = useState(20)
  const recent = useSessions({ running: false, limit: recentLimit })
  const refetchSessions = (): void => {
    running.refetch()
    recent.refetch()
  }
  const runningSessions = running.data ?? []
  const recentSessions = recent.data ?? []
  // A full page (returned length === requested limit) means there may be more.
  const hasMore = recentSessions.length === recentLimit

  // Feed the new-session modal. These hooks load lazily and stay cheap when the
  // modal is closed (the data is just handed to a dumb component).
  const profiles = useProfiles()
  const harnesses = useHarnesses()
  const models = useModels()
  const providers = useProviders()

  const providerNames: Record<string, string> = {}
  for (const p of providers.data ?? []) providerNames[p.id] = p.name

  // Keep the URL hash in sync so reloads land on the same view (no remote nav).
  useEffect(() => {
    window.location.hash = encodeView(view)
  }, [view])

  const mode: AppMode = view.kind === "settings" ? "settings" : "sessions"

  const onModeChange = (next: AppMode): void =>
    setView(
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
    const r = await client.launchHarness({
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
    if (v.saveAsProfile !== undefined) {
      await client.addProfile({
        name: v.saveAsProfile.name,
        harnessId: v.harnessId,
        ...(v.modelId !== undefined ? { modelId: v.modelId } : {}),
        env: v.env,
      })
    }
    const id = r.value.sessionId
    setOpenSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setView({ kind: "sessions", selectedSessionId: id })
    setModalOpen(false)
    // Refetch so the freshly launched session shows up under "Running" in the
    // master (the deleted DashboardPage used to do this after a launch).
    refetchSessions()
  }

  /**
   * A live session's pty exited: drop it from the open set so its dead live pane
   * unmounts (selecting it now renders the read-only replay), and refetch so the
   * master moves it from Running to Recent.
   */
  const onSessionExit = (id: SessionId): void => {
    setOpenSessionIds((prev) => prev.filter((x) => x !== id))
    refetchSessions()
  }

  const { master, detail } =
    view.kind === "settings"
      ? SettingsView({
          section: view.section,
          onSection: (key) => setView({ kind: "settings", section: key }),
        })
      : SessionsView({
          ...(view.selectedSessionId === undefined
            ? {}
            : { selectedSessionId: view.selectedSessionId }),
          openSessionIds,
          running: runningSessions,
          recent: recentSessions,
          hasMore,
          onMore: () => setRecentLimit((l) => l + 20),
          onSelect: (id) =>
            setView({ kind: "sessions", selectedSessionId: id }),
          onNew: () => {
            profiles.refetch()
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
        master={master}
        detail={detail}
      />
      <NewSessionModal
        open={modalOpen}
        profiles={profiles.data ?? []}
        harnesses={harnesses.data ?? []}
        models={models.data ?? []}
        providerNames={providerNames}
        folder={folder}
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
}: AppProps): ReactElement => (
  <IpcClientProvider client={client}>
    <StoreProvider client={client}>
      <AppInner
        initialView={initialView}
        terminalClient={terminalClient}
        createTerminal={createTerminal}
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
