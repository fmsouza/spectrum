import path from "node:path"
import { resolveAppPaths } from "./paths"
import type { Platform } from "./platform"

export interface LegacyMacosMigration {
  readonly kind: "move" | "noop"
  readonly from?: string
  readonly to?: string
}

export interface PlanLegacyMacosMigrationInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly newDataDirExists: boolean
  readonly legacyDirExists: boolean
}

/** The pre-migration location used by every LaunchKit build before the idiomatic-paths change. */
export const legacyMacosConfigDir = (homeDir: string): string =>
  path.posix.join(homeDir, ".config", "launchkit")

/**
 * Decide whether the legacy `~/.config/launchkit` dir should be copied to the idiomatic macOS
 * `~/Library/Application Support/Spectrum`. Pure — the caller performs the copy. Only macOS
 * migrates (Linux already lives at `~/.config/launchkit`; Windows is new).
 */
export const planLegacyMacosMigration = (
  input: PlanLegacyMacosMigrationInput,
): LegacyMacosMigration => {
  if (input.platform !== "macos") return { kind: "noop" }
  if (input.newDataDirExists || !input.legacyDirExists) return { kind: "noop" }
  const to = resolveAppPaths({
    platform: input.platform,
    homeDir: input.homeDir,
    env: input.env,
  }).dataDir
  return { kind: "move", from: legacyMacosConfigDir(input.homeDir), to }
}
