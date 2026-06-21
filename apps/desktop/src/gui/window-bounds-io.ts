import type { ConfigStore } from "@spectrum/config"
import type { Logger } from "@spectrum/logger"
import { isOk } from "@spectrum/utils"
import {
  DEFAULT_BOUNDS,
  type WindowBounds,
  boundsToFrame,
  sanitizeBounds,
  settingsWithBounds,
} from "./window-bounds"

/** Opaque timer handle — `setTimeout`'s return type in this runtime. */
type TimerHandle = ReturnType<typeof setTimeout>

/** The bounds restore + persist seam consumed by `gui/window.ts`. */
export type WindowBoundsIO = {
  /** Resolve the initial frame from persisted (sanity-checked) bounds, or the default. */
  readonly loadInitialFrame: () => Promise<WindowBounds>
  /** Record a new window geometry; debounced before it is written to disk. */
  readonly onBoundsChange: (bounds: WindowBounds) => void
}

/** Trailing-debounce window (ms) for resize/move bursts before a config write. */
const DEFAULT_DEBOUNCE_MS = 400

/**
 * Build the window-bounds IO over a config store. The debounce timer is injected
 * (`setTimer`/`clearTimer`, defaulting to `setTimeout`/`clearTimeout`) so the
 * coalescing logic is unit-testable without real time. Failures are logged at
 * this effect boundary via the injected `Logger` and never throw into the
 * Electrobun event loop.
 */
export const createWindowBoundsIO = (deps: {
  readonly config: ConfigStore
  readonly log: Logger
  readonly debounceMs?: number
  readonly setTimer?: (fn: () => void, ms: number) => TimerHandle
  readonly clearTimer?: (handle: TimerHandle) => void
}): WindowBoundsIO => {
  const { config, log } = deps
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle))

  let pending: WindowBounds | null = null
  let handle: TimerHandle | null = null

  const flush = async (): Promise<void> => {
    const bounds = pending
    pending = null
    if (bounds === null) return
    const loaded = await config.load()
    if (!isOk(loaded)) {
      if (loaded.error.kind !== "not-found") {
        log.error("window bounds save skipped: config load failed", {
          kind: loaded.error.kind,
          detail: loaded.error.detail,
        })
      }
      return
    }
    const next = {
      ...loaded.value,
      settings: settingsWithBounds(loaded.value.settings, bounds),
    }
    const saved = await config.save(next)
    if (!isOk(saved)) {
      if (saved.error.kind !== "not-found") {
        log.error("window bounds save failed", {
          kind: saved.error.kind,
          detail: saved.error.detail,
        })
      }
    }
  }

  return {
    loadInitialFrame: async (): Promise<WindowBounds> => {
      const loaded = await config.load()
      if (!isOk(loaded)) {
        if (loaded.error.kind !== "not-found") {
          log.error("window bounds restore failed: config load failed", {
            kind: loaded.error.kind,
            detail: loaded.error.detail,
          })
        }
        return DEFAULT_BOUNDS
      }
      return boundsToFrame(sanitizeBounds(loaded.value.settings.windowBounds))
    },
    onBoundsChange: (bounds: WindowBounds): void => {
      pending = bounds
      if (handle !== null) clearTimer(handle)
      handle = setTimer(() => {
        handle = null
        void flush()
      }, debounceMs)
    },
  }
}
