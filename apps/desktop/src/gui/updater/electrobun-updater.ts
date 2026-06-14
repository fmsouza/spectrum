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
  /** Read/write the bundle's Resources/version.json (channel switch). Injected for tests. */
  readonly versionFile?: {
    read: () => Promise<string>
    write: (contents: string) => Promise<void>
  }
}

/** Production loader: lazy-import so `bun test` never loads native FFI. */
const realLoadEngine = async (): Promise<UpdaterEngine> => {
  const { Updater } = (await import("electrobun/bun")) as unknown as {
    Updater: UpdaterEngine
  }
  return Updater
}

/** Production version.json accessor (Electrobun uses ../Resources/version.json relative to process cwd). */
const realVersionFile = {
  read: (): Promise<string> => Bun.file("../Resources/version.json").text(),
  write: (contents: string): Promise<void> =>
    Bun.write("../Resources/version.json", contents).then(() => undefined),
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

  let enginePromise: Promise<UpdaterEngine> | null = null
  const engine = (): Promise<UpdaterEngine> => {
    if (enginePromise === null) enginePromise = deps.loadEngine()
    return enginePromise
  }

  const subscribe = (eng: UpdaterEngine): void => {
    if (subscribed) return
    subscribed = true
    eng.onStatusChange((e) => {
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
            progress: toFraction(e.details?.progress, raw.progress),
          }
          break
        case "download-complete":
        case "patch-chain-complete":
          raw = { ...raw, phase: "downloaded", progress: 1 }
          break
        case "error":
          // A late error (e.g. post-download cleanup) must not regress a
          // successfully staged update back to a failed state.
          if (raw.phase !== "downloaded") {
            raw = { ...raw, phase: "error", error: "download-failed" }
          }
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
        const eng = await engine()
        subscribe(eng)
        const current = await eng.localInfo.version()
        const info = await eng.checkForUpdate()
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
      void engine()
        .then((eng) => {
          subscribe(eng)
          return eng.downloadUpdate()
        })
        .catch(() => {
          raw = { ...raw, phase: "error", error: "download-failed" }
        })
    },

    apply: async (): Promise<Result<void, UpdaterError>> => {
      raw = { ...raw, phase: "applying", error: null }
      try {
        const eng = await engine()
        await eng.applyUpdate() // swaps the bundle + relaunches (may not return)
        return ok(undefined)
      } catch (e) {
        raw = { ...raw, phase: "error", error: "apply-failed" }
        return err({ kind: "apply-failed", detail: errorText(e) })
      }
    },

    setChannel: async (
      channel: Channel,
    ): Promise<Result<void, UpdaterError>> => {
      // Electrobun derives the active channel from the bundle's Resources/version.json,
      // which Updater caches for the process lifetime (no public cache-clear). So a
      // channel switch is written to that file and takes effect on the NEXT app
      // restart. Best-effort: a read-only bundle simply keeps the prior channel until
      // a writable reinstall — the user's preference is still persisted in config by
      // the handler, so we never fail the toggle here.
      const vf = deps.versionFile ?? realVersionFile
      try {
        const raw = await vf.read()
        const parsed = JSON.parse(raw) as Record<string, unknown>
        parsed.channel = channel
        await vf.write(JSON.stringify(parsed, null, 2))
      } catch {
        // swallow — preference persists in config; engine picks it up after a writable reinstall
      }
      return ok(undefined)
    },
  }
}

/** Message-safe error text (no stack), for the `detail` field. */
const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

/** Electrobun emits download progress as a 0–100 percentage; normalize to 0–1, clamped. */
const toFraction = (pct: number | undefined, fallback: number): number => {
  if (pct === undefined) return fallback
  const f = pct / 100
  return f < 0 ? 0 : f > 1 ? 1 : f
}
