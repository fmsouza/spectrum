import path from "node:path"
import type { SpectrumEnv } from "./app-env"
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
  /** Selects the app dir name. Omitted ⇒ production (the safe default). */
  readonly appEnv?: SpectrumEnv
}

const APP_DIR_NAME: Record<SpectrumEnv, string> = {
  production: "Spectrum", // macOS + Windows
  development: "Spectrum (Dev)",
}
const XDG_DIR_NAME: Record<SpectrumEnv, string> = {
  production: "spectrum", // Linux / unknown
  development: "spectrum-dev",
}

export const nonEmpty = (v: string | undefined): v is string =>
  v !== undefined && v.length > 0

/** Resolve the single per-OS application directory and the files within it. Pure. */
export const resolveAppPaths = (input: ResolveAppPathsInput): AppPaths => {
  const { platform, homeDir, env, appEnv = "production" } = input
  const p = platform === "windows" ? path.win32 : path.posix
  const appDirName = APP_DIR_NAME[appEnv]
  const xdgDirName = XDG_DIR_NAME[appEnv]

  const dataDir = ((): string => {
    if (nonEmpty(env.SPECTRUM_DATA_DIR)) return env.SPECTRUM_DATA_DIR
    switch (platform) {
      case "macos":
        return p.join(homeDir, "Library", "Application Support", appDirName)
      case "windows": {
        const base = nonEmpty(env.APPDATA)
          ? env.APPDATA
          : path.win32.join(homeDir, "AppData", "Roaming")
        return path.win32.join(base, appDirName)
      }
      default: {
        const base = nonEmpty(env.XDG_CONFIG_HOME)
          ? env.XDG_CONFIG_HOME
          : p.join(homeDir, ".config")
        return p.join(base, xdgDirName)
      }
    }
  })()

  return {
    dataDir,
    configFile: p.join(dataDir, "config.json"),
    dbFile: p.join(dataDir, "spectrum.db"),
    harnessDir: p.join(dataDir, "harnesses"),
    runtimeFile: p.join(dataDir, "runtime.json"),
    secretsDir: p.join(dataDir, "secrets"),
  }
}
