import type { Result } from "@spectrum/utils"

export type Channel = "stable" | "canary"

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "applying"
  | "error"

/** State the adapter owns — config-free (no channel/dismissal). */
export interface RawUpdateState {
  readonly phase: UpdatePhase
  readonly currentVersion: string
  readonly latestVersion: string | null
  readonly available: boolean
  readonly progress: number
  readonly error: string | null
}

export type UpdaterErrorKind =
  | "offline"
  | "check-failed"
  | "download-failed"
  | "apply-failed"
  | "channel-switch-failed"

export interface UpdaterError {
  readonly kind: UpdaterErrorKind
  readonly detail: string
}

/**
 * The injected updater seam. The real impl wraps Electrobun's `Updater`; tests
 * inject `FakeUpdater`. The webview never sees this — it crosses via IPC as
 * `UpdateState`. `startDownload`/`apply` are fire-and-forget (a download/apply
 * may exceed the 5s IPC RPC budget); progress is observed via `getRaw()`.
 */
export interface UpdaterAdapter {
  /** Synchronous snapshot of the current raw state. */
  getRaw(): RawUpdateState
  /** Network check against the given channel; updates the raw snapshot. */
  check(channel: Channel): Promise<Result<void, UpdaterError>>
  /** Begin staging the update in the background. Returns immediately. */
  startDownload(): void
  /** Apply the staged update and relaunch. May not return (process exits). */
  apply(): Promise<Result<void, UpdaterError>>
  /** Switch the followed channel (rewrites the bundle's version.json — see spike). */
  setChannel(channel: Channel): Promise<Result<void, UpdaterError>>
}
