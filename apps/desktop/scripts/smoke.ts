#!/usr/bin/env bun
// Cross-platform GUI smoke: launch the built app and prove the proxy answers /health on loopback.
// Exits non-zero on any failure.
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { type Platform, detectPlatform } from "@launchkit/platform"

const PORT = Number(process.env.LK_PORT ?? "4000")
const BUILD_DIR = join(import.meta.dir, "..", "build")

/**
 * The Electrobun bundle's entry point is the `launcher` binary (`launcher.exe` on Windows) —
 * NOT a file named after the app. The bundle also ships other executables (`bun`, `bspatch`, …)
 * that must NOT be picked, so match the launcher by exact basename. App-named binaries
 * (`LaunchKit` / `LaunchKit.exe`) are accepted as a fallback for non-dev release layouts.
 */
export const launcherCandidates = (platform: Platform): readonly string[] =>
  platform === "windows"
    ? ["launcher.exe", "launchkit.exe", "launchkit-dev.exe"]
    : ["launcher", "launchkit", "launchkit-dev"]

export const isLauncherEntry = (entry: string, platform: Platform): boolean =>
  launcherCandidates(platform).includes(entry.toLowerCase())

/** Recursively find the Electrobun launcher executable under the platform's build subdir. */
export const resolveAppExecutable = (
  buildDir: string = BUILD_DIR,
  platform: Platform = detectPlatform(),
): string => {
  const walk = (dir: string): string | null => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        const found = walk(full)
        if (found) return found
      } else if (isLauncherEntry(entry, platform)) {
        return full
      }
    }
    return null
  }
  if (!existsSync(buildDir)) {
    throw new Error(`build dir not found: ${buildDir} (run the build first)`)
  }
  const exe = walk(buildDir)
  if (!exe)
    throw new Error(`could not locate a LaunchKit launcher under ${buildDir}`)
  return exe
}

const pollHealth = async (): Promise<boolean> => {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await Bun.sleep(500)
  }
  return false
}

const main = async (): Promise<void> => {
  const exe = resolveAppExecutable()
  console.log(`==> launching ${exe}`)
  const proc = Bun.spawn([exe], { stdout: "inherit", stderr: "inherit" })
  try {
    const ok = await pollHealth()
    if (!ok) {
      console.error(
        `FAIL: proxy never answered /health on 127.0.0.1:${PORT} after launch`,
      )
      process.exit(1)
    }
    console.log("PASS: app launched and proxy answered /health on loopback")
  } finally {
    proc.kill()
  }
}

// Only launch when run directly (`bun scripts/smoke.ts`); importing for tests must not spawn.
if (import.meta.main) await main()
