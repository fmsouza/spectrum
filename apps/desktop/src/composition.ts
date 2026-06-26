/**
 * The GUI composition seam. `createGuiContext(shared, deps)` extends the SHARED
 * `AppContext` (built by `@spectrum/runtime-core`'s `createAppContext`) with
 * the GUI-only pieces: the native run manager, the loopback runner socket,
 * the renderer watchdog, the updater, the native folder picker, the URL
 * opener, and the factory-reset routine.
 *
 * What lives here (and ONLY here):
 * - Construction of the GUI seams (`createRunManager`, `startRunnerSocket`,
 *   `createRendererWatchdog`, `createElectrobunUpdater`, `createResetApp`).
 * - The native run-finished notification pipeline (`createNotificationService`
 *   + `withNotifierTap` + root-runner gating).
 * - Lazy native imports (`electrobun/bun` for folder picker / URL opener /
 *   `pickFolder` / `openExternalUrl`) so `bun test` never loads native FFI.
 *
 * What DOES NOT live here:
 * - Any shared subsystem wiring — that moved to `@spectrum/runtime-core` in
 *   the Stage 1 refactor (Tasks 1-4). The CLI and the GUI both consume
 *   `createAppContext`; only the GUI wraps it with `createGuiContext`.
 *
 * End-state: composition.ts is GUI-only. The CLI lives in `apps/cli/`, which
 * imports `createAppContext` directly from `@spectrum/runtime-core` (no
 * `createGuiContext`, no `detectMode`, no `runApp`). The dual-mode routing
 * (detectMode + runApp + runCli) was removed in Stage 2 Task 8; this file
 * is no longer the composition root for the whole binary.
 */

// Re-exports from the shared composition root so existing
// `import type { AppContext } from "../composition"` keeps resolving in gui/*.
export type {
  AppContext,
  CreateAppContextDeps,
  ProviderTestResult,
} from "@spectrum/runtime-core"
export { createAppContext, realDeps } from "@spectrum/runtime-core"

import { rmSync } from "node:fs"

import type {
  AgentDriver,
  RunManager,
  RunManagerDeps,
  RunnerOutbound,
} from "@spectrum/agent-driver"
import { createRunManager } from "@spectrum/agent-driver"
import type { RootRunnerMap } from "@spectrum/agent-events"
import { isRootRunnerFinished, trackRootRunner } from "@spectrum/agent-events"
import type { Logger } from "@spectrum/logger"
import type { Result } from "@spectrum/utils"

import type { AppContext } from "@spectrum/runtime-core"

import { createNotificationService } from "./gui/notification-service"
import { defaultRelaunch } from "./gui/relaunch"
import {
  type RendererWatchdog,
  createRendererWatchdog,
  realWatchdogTimers,
} from "./gui/renderer-watchdog"
import { type ResetError, createResetApp } from "./gui/reset-app"
import {
  type SessionInfoResolver,
  mapRunFinished,
} from "./gui/run-finished-mapping"
import { withNotifierTap } from "./gui/runner-sink"
import { type RunnerSocket, startRunnerSocket } from "./gui/runner-socket"
import { createElectrobunUpdater } from "./gui/updater/electrobun-updater"
import type { UpdaterAdapter } from "./gui/updater/updater-adapter"
import { isWindowFocused } from "./gui/window"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The GUI-extended context: every shared field from `AppContext` plus the
 * 7 GUI-only fields the renderer and IPC handlers consume.
 */
export interface GuiContext extends AppContext {
  readonly runner: RunManager
  /** `ws://localhost:<port>/` the webview connects to for canonical run events. */
  readonly runnerSocketUrl: string
  readonly rendererWatchdog: RendererWatchdog
  readonly resetApp: () => Promise<Result<void, ResetError>>
  readonly pickFolder: (opts: { readonly startingFolder?: string }) => Promise<
    readonly string[]
  >
  readonly openExternalUrl: (url: string) => Promise<boolean>
  readonly updater: UpdaterAdapter
}

/**
 * The 5 GUI seams `createGuiContext` injects. Defaulted to the real adapters
 * in `realGuiDeps`; tests inject fakes to exercise wiring shape without
 * loading native FFI / opening sockets.
 */
export interface CreateGuiContextDeps {
  readonly createRunManager: typeof createRunManager
  readonly startRunnerSocket: typeof startRunnerSocket
  readonly createRendererWatchdog: typeof createRendererWatchdog
  /** Recursively remove a directory (factory reset). */
  readonly removeDir: (dir: string) => void
  /** Relaunch the app process (Electrobun). Defaulted to a lazy native call. */
  readonly relaunch: () => void
}

// ---------------------------------------------------------------------------
// realGuiDeps — production wiring
// ---------------------------------------------------------------------------

/** Recursive directory removal (factory reset). */
const defaultRemoveDir = (dir: string): void => {
  rmSync(dir, { recursive: true, force: true })
}

/** Production defaults for the GUI seams. */
export const realGuiDeps: CreateGuiContextDeps = {
  createRunManager,
  startRunnerSocket,
  createRendererWatchdog,
  removeDir: defaultRemoveDir,
  relaunch: defaultRelaunch,
}

// ---------------------------------------------------------------------------
// createGuiContext
// ---------------------------------------------------------------------------

/**
 * Build the GUI context: consume the shared `AppContext` (built by
 * `@spectrum/runtime-core`'s `createAppContext`) and construct the 7
 * GUI-only fields from the runner extension points + the injected seams.
 *
 * The runner extension points (`sessionSink`, `runStore`, `routingDriver`,
 * `resolveResumeInput`, `resolveModelEnv`) come from `shared` — the GUI
 * never re-derives them. `dataDir` and `legacyDirs` likewise come from
 * `shared` (exposed on `AppContext.paths.dataDir` + `AppContext.legacyDirs`
 * since Task 2/4).
 */
export const createGuiContext = (
  shared: AppContext,
  deps: CreateGuiContextDeps = realGuiDeps,
): GuiContext => {
  const log: Logger = shared.log

  // ------------------------------------------------------------------
  // Native run-finished notification pipeline
  // ------------------------------------------------------------------
  //
  // Root-gating: a multi-agent run emits one `runner-finished` PER runner
  // (each sub-agent AND the root). Only the ROOT finish is a session-end,
  // so we track each session's root runner (the first parentless
  // `runner-started`) and notify ONLY when the finishing runner IS that
  // root. Fail-closed: an unknown root suppresses the notification.
  const notifyLog = log.child("notify")
  const notifier = createNotificationService({
    showNotification: (n) => {
      void import("electrobun/bun").then(({ Utils }) =>
        Utils.showNotification(n),
      )
    },
    isWindowFocused,
  })
  // Resolve a finished session's harness + cwd for the notification body.
  const resolveSessionInfo: SessionInfoResolver = (sessionId) => {
    const queried = shared.sessions.query()
    if (!queried.ok) return undefined
    const found = queried.value.find((s) => String(s.id) === sessionId)
    if (found === undefined) return undefined
    return {
      harnessId: String(found.harnessId),
      ...(found.cwd !== undefined ? { cwd: found.cwd } : {}),
    }
  }
  let roots: RootRunnerMap = new Map()
  const notifyOnRunFinished = (message: RunnerOutbound): void => {
    if (message.type === "runner-event") {
      const sessionId = message.id
      const inner = message.event.event
      roots = trackRootRunner(roots, sessionId, inner)
      if (!isRootRunnerFinished(roots, sessionId, inner)) return
    }
    const finished = mapRunFinished(message, resolveSessionInfo)
    if (finished === null) return
    notifyLog.info("run-finished native notification dispatched", {
      sessionId: finished.sessionId,
      harnessId: finished.harnessId,
      status: finished.status,
    })
    notifier.onRunFinished(finished)
  }

  // ------------------------------------------------------------------
  // Runner — built from the SHARED extension points (no re-derivation)
  // ------------------------------------------------------------------
  const baseRunner = deps.createRunManager({
    driver: shared.routingDriver,
    sessions: shared.sessionSink,
    events: shared.runStore,
    clock: shared.clock,
    logger: log.child("runner"),
    // Before the webview socket connects, the manager's sink is this notifier tap.
    send: notifyOnRunFinished,
    resolveModelEnv: shared.resolveModelEnv,
    resolveResumeInput: shared.resolveResumeInput,
  })
  // The runner socket calls `bindSend` on connect, REPLACING the manager's
  // sink with one that pushes to the live websocket. `withNotifierTap`
  // composes the notifier tap INTO that socket sink so native notifications
  // fire regardless of which socket is bound.
  const runner: RunManager = withNotifierTap(baseRunner, notifyOnRunFinished)

  // ------------------------------------------------------------------
  // Renderer watchdog — sustained disconnect ⇒ WKWebView content died
  // ------------------------------------------------------------------
  const rendererWatchdog = deps.createRendererWatchdog({
    timers: realWatchdogTimers,
    logger: log.child("renderer-watchdog"),
    onGiveUp: () => {
      void import("electrobun/bun").then(({ Utils }) =>
        Utils.showNotification({
          title: "Spectrum",
          body: "The window stopped responding and couldn't recover. Please restart Spectrum.",
        }),
      )
    },
  })

  // ------------------------------------------------------------------
  // Runner socket — loopback WebSocket for canonical run-event stream
  // ------------------------------------------------------------------
  const runnerSocket: RunnerSocket = deps.startRunnerSocket(runner, {
    onConnect: () => rendererWatchdog.onConnect(),
    onDisconnect: () => rendererWatchdog.onDisconnect(),
  })

  // ------------------------------------------------------------------
  // Factory reset — uses shared dataDir/legacyDirs, GUI relaunch seam
  // ------------------------------------------------------------------
  const resetApp = createResetApp({
    config: shared.config,
    secrets: shared.secrets,
    closeDb: shared.closeDb,
    removeDir: deps.removeDir,
    relaunch: deps.relaunch,
    dataDir: shared.paths.dataDir,
    legacyDirs: shared.legacyDirs,
    logger: log.child("reset"),
  })

  // ------------------------------------------------------------------
  // Updater — lazy Electrobun engine
  // ------------------------------------------------------------------
  const updater = createElectrobunUpdater()

  // ------------------------------------------------------------------
  // Native folder picker — lazy so bun test never loads native FFI
  // ------------------------------------------------------------------
  const pickFolder: GuiContext["pickFolder"] = async (opts) => {
    const { Utils } = await import("electrobun/bun")
    const paths = await Utils.openFileDialog({
      canChooseDirectory: true,
      canChooseFiles: false,
      allowsMultipleSelection: false,
      ...(opts.startingFolder === undefined
        ? {}
        : { startingFolder: opts.startingFolder }),
    })
    // Empty/cancelled selection comes back as [""] from the comma-split; drop it.
    return paths.filter((p) => p.trim() !== "")
  }

  // ------------------------------------------------------------------
  // OS-default URL opener — lazy import
  // ------------------------------------------------------------------
  const openExternalUrl: GuiContext["openExternalUrl"] = async (url) => {
    const { Utils } = await import("electrobun/bun")
    return Utils.openExternal(url)
  }

  return {
    ...shared,
    runner,
    runnerSocketUrl: runnerSocket.url,
    rendererWatchdog,
    resetApp,
    pickFolder,
    openExternalUrl,
    updater,
  }
}

// ---------------------------------------------------------------------------
// Type re-exports for gui/* consumers that import `RunManager` etc.
// ---------------------------------------------------------------------------
export type { RunManager, RunManagerDeps, AgentDriver }
