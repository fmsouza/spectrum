import path from "node:path"
import type { Platform } from "./platform"

export interface AppPaths {
  readonly dataDir: string
  readonly configFile: string
  readonly dbFile: string
  readonly harnessDir: string
  readonly runtimeFile: string
  readonly secretsDir: string
}

export interface ResolveAppPathsInput {
  readonly platform: Platform
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}

const APP_DIR_NAME = "LaunchKit" // macOS + Windows
const XDG_DIR_NAME = "launchkit" // Linux / unknown

const nonEmpty = (v: string | undefined): v is string =>
  v !== undefined && v.length > 0

/** Resolve the single per-OS application directory and the files within it. Pure. */
export const resolveAppPaths = (input: ResolveAppPathsInput): AppPaths => {
  const { platform, homeDir, env } = input
  const p = platform === "windows" ? path.win32 : path.posix

  const dataDir = ((): string => {
    if (nonEmpty(env.LAUNCHKIT_DATA_DIR)) return env.LAUNCHKIT_DATA_DIR
    switch (platform) {
      case "macos":
        return p.join(homeDir, "Library", "Application Support", APP_DIR_NAME)
      case "windows": {
        const base = nonEmpty(env.APPDATA)
          ? env.APPDATA
          : path.win32.join(homeDir, "AppData", "Roaming")
        return path.win32.join(base, APP_DIR_NAME)
      }
      default: {
        const base = nonEmpty(env.XDG_CONFIG_HOME)
          ? env.XDG_CONFIG_HOME
          : p.join(homeDir, ".config")
        return p.join(base, XDG_DIR_NAME)
      }
    }
  })()

  return {
    dataDir,
    configFile: p.join(dataDir, "config.json"),
    dbFile: p.join(dataDir, "launchkit.db"),
    harnessDir: p.join(dataDir, "harnesses"),
    runtimeFile: p.join(dataDir, "runtime.json"),
    secretsDir: p.join(dataDir, "secrets"),
  }
}
