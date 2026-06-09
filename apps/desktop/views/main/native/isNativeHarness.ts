import type { HarnessId } from "@launchkit/types"

/**
 * Harness ids that launch through the native `RunManager` (and so render the
 * native `RunView`) rather than the embedded terminal. Spec 1 registers only the
 * dev-only "demo" harness (the `FakeDriver`); real drivers add their id here as
 * each later spec lands. Mirrors the backend driver registry's membership; kept
 * pure so the webview never imports the backend.
 */
const NATIVE_HARNESS_IDS: ReadonlySet<string> = new Set(["demo"])

export const isNativeHarness = (harnessId: HarnessId | undefined): boolean =>
  harnessId !== undefined && NATIVE_HARNESS_IDS.has(harnessId)
