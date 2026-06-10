import type { HarnessId } from "@launchkit/types"

/** The minimal harness-view shape the predicate reads (a `native` flag keyed by id). */
export interface NativeFlaggedHarness {
  readonly id: string
  readonly native: boolean
}

/**
 * Whether a harness launches through the native `RunManager` (rendering the native `RunView`) rather
 * than the embedded terminal. DATA-DRIVEN from the loaded harness list (`getHarnesses` surfaces the
 * backend driver registry's `native` flag) — the single source of truth is the backend registry, so
 * this never hardcodes ids.
 */
export const isNativeHarness = (
  harnessId: HarnessId | undefined,
  harnesses: readonly NativeFlaggedHarness[],
): boolean =>
  harnessId !== undefined &&
  (harnesses.find((h) => h.id === String(harnessId))?.native ?? false)
