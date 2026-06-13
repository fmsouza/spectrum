import { cpSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Platform,
  legacyMacosConfigDir,
  planLegacyMacosMigration,
  resolveAppPaths,
} from "@launchkit/platform"

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
}

const MARKER = ".migrated-to-app-support"

export const realMigrationFs: MigrationFs = {
  exists: (p) => existsSync(p),
  copyDir: (from, to) => cpSync(from, to, { recursive: true }),
  writeMarker: (p) => writeFileSync(p, "migrated to ~/Library/Application Support/LaunchKit\n"),
}

/**
 * One-time, non-destructive macOS migration: copy `~/.config/launchkit` to the idiomatic
 * `~/Library/Application Support/LaunchKit` (leaving the legacy dir in place as a backup, marked).
 * No-op on Linux/Windows and when already migrated. Synchronous so it can run inside the
 * synchronous `createAppContext`.
 */
export const migrateLegacyMacosConfig = (
  input: MigrateLegacyMacosConfigInput,
  fs: MigrationFs = realMigrationFs,
): void => {
  const newDataDir = resolveAppPaths(input).dataDir
  const legacyDir = legacyMacosConfigDir(input.homeDir)
  const plan = planLegacyMacosMigration({
    ...input,
    newDataDirExists: fs.exists(newDataDir),
    legacyDirExists: fs.exists(legacyDir),
  })
  if (plan.kind !== "move" || plan.from === undefined || plan.to === undefined) return
  fs.copyDir(plan.from, plan.to)
  fs.writeMarker(join(plan.from, MARKER))
}
