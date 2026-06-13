import path from "node:path"
import { resolveAppPaths } from "./paths"
import type { Platform } from "./platform"

export interface SpectrumMigration {
  readonly kind: "move" | "noop"
  readonly from?: string
  readonly to?: string
}

export interface PlanSpectrumMigrationInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly oldDirExists: boolean
  readonly newDirExists: boolean
}

export interface LegacyLaunchkitDataDirInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}

const OLD_APP_DIR_NAME = "LaunchKit"
const OLD_XDG_DIR_NAME = "launchkit"

const nonEmpty = (v: string | undefined): v is string =>
  v !== undefined && v.length > 0

/** The pre-rename Spectrum data dir (named "LaunchKit"/"launchkit"). Pure. */
export const legacyLaunchkitDataDir = (
  input: LegacyLaunchkitDataDirInput,
): string => {
  const { platform, homeDir, env } = input
  const p = platform === "windows" ? path.win32 : path.posix
  switch (platform) {
    case "macos":
      return p.join(homeDir, "Library", "Application Support", OLD_APP_DIR_NAME)
    case "windows": {
      const base = nonEmpty(env.APPDATA)
        ? env.APPDATA
        : path.win32.join(homeDir, "AppData", "Roaming")
      return path.win32.join(base, OLD_APP_DIR_NAME)
    }
    default: {
      const base = nonEmpty(env.XDG_CONFIG_HOME)
        ? env.XDG_CONFIG_HOME
        : p.join(homeDir, ".config")
      return p.join(base, OLD_XDG_DIR_NAME)
    }
  }
}

/**
 * Decide whether the pre-rename LaunchKit data dir should be copied to the new Spectrum dir.
 * Pure — the caller performs the copy. No-op when the new dir exists or the old one is absent.
 */
export const planLaunchkitToSpectrumMigration = (
  input: PlanSpectrumMigrationInput,
): SpectrumMigration => {
  if (input.newDirExists || !input.oldDirExists) return { kind: "noop" }
  const to = resolveAppPaths({
    platform: input.platform,
    homeDir: input.homeDir,
    env: input.env,
  }).dataDir
  const from = legacyLaunchkitDataDir(input)
  if (from === to) return { kind: "noop" }
  return { kind: "move", from, to }
}
