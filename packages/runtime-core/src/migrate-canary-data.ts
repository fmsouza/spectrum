import { type Platform, resolveAppPaths } from "@spectrum/platform"
import { type MigrationFs, realMigrationFs } from "./migrate-legacy-config"

export interface MigrateCanaryInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * One-time, non-destructive: when a canary build starts and has no data dir yet, seed it from the
 * shared production dir so canary keeps the user's providers/models/sessions. The OS keychain stays
 * shared (production service), so copied secret refs still resolve; the copy also brings `secrets/`
 * for file-backed platforms. No-op once the canary dir exists. Synchronous (runs in createAppContext).
 */
export const migrateProductionToCanary = (
  input: MigrateCanaryInput,
  fs: MigrationFs = realMigrationFs,
): void => {
  const prodDir = resolveAppPaths({ ...input, channel: "stable" }).dataDir
  const canaryDir = resolveAppPaths({ ...input, channel: "canary" }).dataDir
  if (fs.exists(canaryDir)) return // already migrated or canary already has its own data
  if (!fs.exists(prodDir)) return // nothing to seed from
  fs.copyDir(prodDir, canaryDir)
}
