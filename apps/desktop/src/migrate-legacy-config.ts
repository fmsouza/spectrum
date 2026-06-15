import { cpSync, existsSync, renameSync, writeFileSync } from "node:fs"
// `plan.from` is a POSIX legacy path (`/Users/me/.config/launchkit`) that must
// stay POSIX regardless of host OS, so we use `path.posix.join` — not `path.join`,
// which is `path.win32.join` on Windows and would convert separators to `\`.
import path from "node:path"
import {
  type Platform,
  legacyLaunchkitDataDir,
  legacyMacosConfigDir,
  planLaunchkitToSpectrumMigration,
  planLegacyMacosMigration,
  resolveAppPaths,
} from "@spectrum/platform"

const { join } = path.posix

export interface MigrateLegacyMacosConfigInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/** The filesystem effects this migration needs — injected so the decision is unit-testable. */
export interface MigrationFs {
  exists(path: string): boolean
  copyDir(from: string, to: string): void
  writeMarker(path: string): void
  renameFile(from: string, to: string): void
}

const MARKER = ".migrated-to-app-support"
const SPECTRUM_MARKER = ".migrated-to-spectrum"

export const realMigrationFs: MigrationFs = {
  exists: (p) => existsSync(p),
  copyDir: (from, to) => cpSync(from, to, { recursive: true }),
  writeMarker: (p) =>
    writeFileSync(p, "migrated to ~/Library/Application Support/Spectrum\n"),
  renameFile: (from, to) => renameSync(from, to),
}

/**
 * One-time, non-destructive macOS migration: copy `~/.config/launchkit` to the idiomatic
 * `~/Library/Application Support/Spectrum` (leaving the legacy dir in place as a backup, marked).
 * No-op on Linux/Windows and when already migrated. Synchronous so it can run inside the
 * synchronous `createAppContext`.
 */
export const migrateLegacyMacosConfig = (
  input: MigrateLegacyMacosConfigInput,
  fs: MigrationFs = realMigrationFs,
): void => {
  // No `appEnv` ⇒ the production data dir. Legacy data only ever lived in production
  // locations; the composition root also runs this only when appEnv === "production".
  const newDataDir = resolveAppPaths(input).dataDir
  const legacyDir = legacyMacosConfigDir(input.homeDir)
  const plan = planLegacyMacosMigration({
    ...input,
    newDataDirExists: fs.exists(newDataDir),
    legacyDirExists: fs.exists(legacyDir),
  })
  if (plan.kind !== "move" || plan.from === undefined || plan.to === undefined)
    return
  fs.copyDir(plan.from, plan.to)
  fs.writeMarker(join(plan.from, MARKER))
}

/**
 * One-time, non-destructive rename migration: copy the pre-rename "LaunchKit"/"launchkit"
 * data dir to the new "Spectrum" dir, renaming `launchkit.db` → `spectrum.db` inside the copy,
 * and leave the old dir in place marked with `.migrated-to-spectrum`. No-op when the Spectrum
 * dir already exists or the old dir is absent. Runs AFTER `migrateLegacyMacosConfig`.
 *
 * Unlike the legacy `.config/launchkit` migration (always POSIX), these paths come from
 * `resolveAppPaths`/`legacyLaunchkitDataDir`, which use the platform-appropriate separator —
 * so the db-path join must match `input.platform` (win32 on Windows, posix elsewhere).
 */
export const migrateLaunchkitToSpectrum = (
  input: MigrateLegacyMacosConfigInput,
  fs: MigrationFs = realMigrationFs,
): void => {
  // No `appEnv` ⇒ the production data dir (see migrateLegacyMacosConfig); production-only by gate.
  const newDataDir = resolveAppPaths(input).dataDir
  const oldDir = legacyLaunchkitDataDir(input)
  const plan = planLaunchkitToSpectrumMigration({
    ...input,
    newDirExists: fs.exists(newDataDir),
    oldDirExists: fs.exists(oldDir),
  })
  if (plan.kind !== "move" || plan.from === undefined || plan.to === undefined)
    return
  fs.copyDir(plan.from, plan.to)
  const p = input.platform === "windows" ? path.win32 : path.posix
  const oldDb = p.join(plan.to, "launchkit.db")
  const newDb = p.join(plan.to, "spectrum.db")
  if (fs.exists(oldDb)) fs.renameFile(oldDb, newDb)
  fs.writeMarker(p.join(plan.from, SPECTRUM_MARKER))
}
