import { type Result, err, ok } from "@spectrum/utils"
import type {
  Channel,
  RawUpdateState,
  UpdaterAdapter,
  UpdaterError,
  UpdaterErrorKind,
} from "./updater-adapter"

export interface FakeUpdaterOptions {
  readonly currentVersion: string
  /** A newer version to advertise; omit for "up to date". */
  readonly latest?: string
  /** Make `check` fail with this error kind. */
  readonly failCheck?: UpdaterErrorKind
  /** Make `apply` fail with this error kind. */
  readonly failApply?: UpdaterErrorKind
}

/** A test double exposing the recorded channel for assertions. */
export interface FakeUpdater extends UpdaterAdapter {
  lastChannel: Channel | null
}

export const createFakeUpdater = (opts: FakeUpdaterOptions): FakeUpdater => {
  let raw: RawUpdateState = {
    phase: "idle",
    currentVersion: opts.currentVersion,
    latestVersion: null,
    available: false,
    progress: 0,
    error: null,
  }
  const fail = (kind: UpdaterErrorKind): UpdaterError => ({
    kind,
    detail: `fake ${kind}`,
  })

  const updater: FakeUpdater = {
    lastChannel: null,
    getRaw: () => raw,
    check: async (): Promise<Result<void, UpdaterError>> => {
      if (opts.failCheck !== undefined) {
        raw = { ...raw, phase: "error", error: opts.failCheck }
        return err(fail(opts.failCheck))
      }
      const available = opts.latest !== undefined
      raw = {
        ...raw,
        phase: available ? "available" : "up-to-date",
        available,
        latestVersion: opts.latest ?? null,
        error: null,
      }
      return ok(undefined)
    },
    startDownload: (): void => {
      raw = { ...raw, phase: "downloaded", progress: 1, error: null }
    },
    apply: async (): Promise<Result<void, UpdaterError>> => {
      if (opts.failApply !== undefined) {
        raw = { ...raw, phase: "error", error: opts.failApply }
        return err(fail(opts.failApply))
      }
      raw = { ...raw, phase: "applying" }
      return ok(undefined)
    },
    setChannel: async (
      channel: Channel,
    ): Promise<Result<void, UpdaterError>> => {
      updater.lastChannel = channel
      return ok(undefined)
    },
  }
  return updater
}
