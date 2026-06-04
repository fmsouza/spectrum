import type { IpcClient } from "@launchkit/ipc"
import type { SessionId } from "@launchkit/types"
import { type AppMode, AppShell, NewSessionModal } from "@launchkit/ui"
import type { NewSessionValues } from "@launchkit/ui"
import { type ReactElement, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { IpcClientProvider, useIpcClient } from "./IpcClientContext"
import { createRealClients } from "./clients"
import { useAliases } from "./hooks/useAliases"
import { useHarnesses } from "./hooks/useHarnesses"
import { useProfiles } from "./hooks/useProfiles"
import { useProxyStatus } from "./hooks/useProxyStatus"
import { useSessions } from "./hooks/useSessions"
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
  // The cwd picked via the native folder dialog (fed into NewSessionModal).
  const [folder, setFolder] = useState<string>("")
  const proxy = useProxyStatus()

  // The session list lives here (not inside SessionsView) so a launch or an exit
  // can refetch it: a new running session must appear and an exited one must
  // move from Running to Recent. Split into running (still live) vs recent.
  const sessions = useSessions()
  const refetchSessions = sessions.refetch
  const allSessions = sessions.data ?? []
  const running = allSessions.filter((s) => s.endedAt === undefined)
  const recent = allSessions.filter((s) => s.endedAt !== undefined)

  // Feed the new-session modal. These hooks load lazily and stay cheap when the
  // modal is closed (the data is just handed to a dumb component).
  const profiles = useProfiles()
  const harnesses = useHarnesses()
  const aliases = useAliases()

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
    if (r.ok && r.value.path !== undefined) setFolder(r.value.path)
  }

  const onSubmitNewSession = async (v: NewSessionValues): Promise<void> => {
    const r = await client.launchHarness({
      id: v.harnessId,
      alias: v.alias,
      name: v.name,
      cwd: v.cwd,
      env: v.env,
    })
    if (!r.ok) return
    if (v.saveAsProfile !== undefined) {
      await client.addProfile({
        name: v.saveAsProfile.name,
        harnessId: v.harnessId,
        alias: v.alias,
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
          running,
          recent,
          hasMore: false,
          onSelect: (id) =>
            setView({ kind: "sessions", selectedSessionId: id }),
          onNew: () => setModalOpen(true),
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
        aliases={aliases.data ?? []}
        folder={folder}
        onBrowse={() => void onBrowse()}
        onSubmit={(v) => void onSubmitNewSession(v)}
        onCancel={() => setModalOpen(false)}
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
    <AppInner
      initialView={initialView}
      terminalClient={terminalClient}
      createTerminal={createTerminal}
    />
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
