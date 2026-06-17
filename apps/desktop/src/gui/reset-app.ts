import type { ConfigStore } from "@spectrum/config"
import type { Logger } from "@spectrum/logger"
import type { SecretStore } from "@spectrum/secrets"
import { type Result, ok } from "@spectrum/utils"

/** Typed failure for a factory reset. Never thrown — always returned. */
export type ResetError = {
  readonly kind: "reset-failed"
  readonly detail: string
}

export interface ResetAppDeps {
  readonly config: ConfigStore
  readonly secrets: SecretStore
  /** Close the live SQLite connection so the file can be removed cleanly. */
  readonly closeDb: () => void
  /** Recursively remove a directory and its contents. */
  readonly removeDir: (dir: string) => void
  /** Relaunch the app process (Electrobun). May not return. */
  readonly relaunch: () => void
  /** The app data dir to wipe (db + config + secrets/ + runtime + harnesses). */
  readonly dataDir: string
  /** Legacy source dirs to also wipe so a factory reset is a clean slate that re-migration cannot restore. */
  readonly legacyDirs: readonly string[]
  /** Scoped logger; receives a redacted warn when a secret delete fails. */
  readonly logger: Logger
}

/**
 * Build the factory-reset routine. Deletes every keychain secret referenced by the
 * current config, closes the db, wipes the data dir, then relaunches. Secret-delete
 * failures are non-fatal (best effort) — the wipe + relaunch still proceed so the app
 * always returns to a clean state. Pure orchestration over injected effects (no fs/keychain
 * reached directly), so it is unit-testable with fakes.
 */
export const createResetApp = (
  deps: ResetAppDeps,
): (() => Promise<Result<void, ResetError>>) => {
  return async () => {
    // 1. Best-effort: remove every keychain secret the config references.
    const loaded = await deps.config.load()
    if (loaded.ok) {
      for (const provider of loaded.value.providers) {
        for (const ref of Object.values(provider.secrets)) {
          const deleted = await deps.secrets.delete(ref)
          // Non-fatal: log a redacted warning (never the ref) and keep wiping.
          if (!deleted.ok)
            deps.logger.warn("secret delete failed during reset", {
              kind: deleted.error.kind,
            })
        }
      }
    }

    // 2. Close the db so the file handle is released, then wipe the whole data dir.
    deps.closeDb()
    deps.removeDir(deps.dataDir)
    // Also wipe legacy source dirs so re-migration cannot restore wiped data on next launch.
    for (const dir of deps.legacyDirs) deps.removeDir(dir)

    // 3. Relaunch to a first-launch state (the new process recreates an empty db + config).
    deps.relaunch()
    return ok(undefined)
  }
}
