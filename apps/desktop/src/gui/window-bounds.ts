import type { Settings } from "@spectrum/config"

/** Main window geometry, structurally compatible with the Electrobun `frame` option. */
export type WindowBounds = {
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
}

/** Frame used for a fresh install or whenever persisted bounds fail the sanity guard. */
export const DEFAULT_BOUNDS: WindowBounds = {
  width: 1024,
  height: 720,
  x: 100,
  y: 100,
}

/** Smallest restorable window — below this a restored window would be unusable. */
const MIN_WIDTH = 400
const MIN_HEIGHT = 300

/**
 * Generous absolute position bound. We cannot enumerate displays through the
 * Electrobun seam, so this is a sanity guard: it rejects corrupt or
 * disconnected-monitor coordinates (e.g. a window saved far off the primary
 * desktop) while still allowing realistic multi-monitor layouts.
 */
const MAX_ABS_POSITION = 32000

/**
 * Validate persisted bounds before restoring them (the "off-screen guard").
 * Returns `null` — meaning "fall back to the default frame" — unless every
 * value is finite, the size meets the minimums, and the position is within a
 * sane on-screen range. Returns the bounds unchanged when they pass.
 */
export const sanitizeBounds = (
  raw: WindowBounds | null,
): WindowBounds | null => {
  if (raw === null) return null
  const { width, height, x, y } = raw
  if (![width, height, x, y].every((n) => Number.isFinite(n))) return null
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null
  if (Math.abs(x) > MAX_ABS_POSITION || Math.abs(y) > MAX_ABS_POSITION) {
    return null
  }
  return { width, height, x, y }
}

/** Resolve the initial window frame: the bounds if present, else the default. */
export const boundsToFrame = (bounds: WindowBounds | null): WindowBounds =>
  bounds ?? DEFAULT_BOUNDS

/** Pure merge of new bounds into a settings object (used by the save path). */
export const settingsWithBounds = (
  settings: Settings,
  bounds: WindowBounds,
): Settings => ({ ...settings, windowBounds: bounds })
