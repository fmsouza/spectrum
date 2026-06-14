import { type Result, err, ok } from "@spectrum/utils"
import type {
  Channel,
  RawUpdateState,
  UpdaterAdapter,
  UpdaterError,
} from "./updater-adapter"

/**
 * The slice of Electrobun's `Updater` this adapter uses. Declared structurally so
 * the unit test injects a fake and the real engine is loaded lazily (no native
 * FFI under `bun test`).
 */
export interface UpdaterEngine {
  checkForUpdate(): Promise<{
    version: string
    hash: string
    updateAvailable: boolean
  }>
  downloadUpdate(): Promise<void>
  applyUpdate(): Promise<void>
  onStatusChange(
    cb: (e: { status: string; details?: { progress?: number } }) => void,
  ): void
  localInfo: { version(): Promise<string> }
}

export interface ElectrobunUpdaterDeps {
  /** Resolve the engine. Production lazily imports Electrobun; tests inject a fake. */
  readonly loadEngine: () => Promise<UpdaterEngine>
}

/** Production loader: lazy-import so `bun test` never loads native FFI. */
const realLoadEngine = async (): Promise<UpdaterEngine> => {
  const { Updater } = (await import("electrobun/bun")) as unknown as {
    Updater: UpdaterEngine
  }
  return Updater
}

export const createElectrobunUpdater = (
  deps: ElectrobunUpdaterDeps = { loadEngine: realLoadEngine },
): UpdaterAdapter => {
  let raw: RawUpdateState = {
    phase: "idle",
    currentVersion: "",
    latestVersion: null,
    available: false,
    progress: 0,
    error: null,
  }
  let subscribed = false

  const subscribe = (engine: UpdaterEngine): void => {
    if (subscribed) return
    subscribed = true
    engine.onStatusChange((e) => {
      switch (e.status) {
        case "downloading":
        case "downloading-full-bundle":
        case "downloading-patch":
          raw = { ...raw, phase: "downloading", error: null }
          break
        case "download-progress":
          raw = {
            ...raw,
            phase: "downloading",
            progress: e.details?.progress ?? raw.progress,
          }
          break
        case "download-complete":
        case "patch-chain-complete":
          raw = { ...raw, phase: "downloaded", progress: 1 }
          break
        case "error":
          raw = { ...raw, phase: "error", error: "download-failed" }
          break
        default:
          break
      }
    })
  }

  return {
    getRaw: () => raw,

    check: async (_channel: Channel): Promise<Result<void, UpdaterError>> => {
      raw = { ...raw, phase: "checking", error: null }
      try {
        const engine = await deps.loadEngine()
        subscribe(engine)
        const current = await engine.localInfo.version()
        const info = await engine.checkForUpdate()
        raw = {
          ...raw,
          phase: info.updateAvailable ? "available" : "up-to-date",
          currentVersion: current,
          available: info.updateAvailable,
          latestVersion: info.updateAvailable ? info.version : null,
          error: null,
        }
        return ok(undefined)
      } catch (e) {
        raw = { ...raw, phase: "error", error: "offline" }
        return err({ kind: "offline", detail: errorText(e) })
      }
    },

    startDownload: (): void => {
      raw = { ...raw, phase: "downloading", progress: 0, error: null }
      // Fire-and-forget: a download can exceed the 5s IPC budget. Progress and
      // completion flow through the onStatusChange subscription into `raw`.
      void deps
        .loadEngine()
        .then((engine) => {
          subscribe(engine)
          return engine.downloadUpdate()
        })
        .catch(() => {
          raw = { ...raw, phase: "error", error: "download-failed" }
        })
    },

    apply: async (): Promise<Result<void, UpdaterError>> => {
      raw = { ...raw, phase: "applying", error: null }
      try {
        const engine = await deps.loadEngine()
        await engine.applyUpdate() // swaps the bundle + relaunches (may not return)
        return ok(undefined)
      } catch (e) {
        raw = { ...raw, phase: "error", error: "apply-failed" }
        return err({ kind: "apply-failed", detail: errorText(e) })
      }
    },

    setChannel: async (
      channel: Channel,
    ): Promise<Result<void, UpdaterError>> => {
      // SPIKE (Task 12): rewrite the bundle's Resources/version.json `channel`
      // field so Electrobun's download/apply follow the new channel. Until the
      // spike lands, persist intent in config (handler) and re-check; a full
      // channel switch may require reinstall on read-only bundles.
      void channel
      return ok(undefined)
    },
  }
}

/** Message-safe error text (no stack), for the `detail` field. */
const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)
