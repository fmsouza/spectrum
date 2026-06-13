#!/usr/bin/env bun
// Cross-platform GUI smoke: launch the built app and prove the proxy answers /health on loopback.
// Exits non-zero on any failure.
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { detectPlatform } from "@launchkit/platform"

const PORT = Number(process.env.LK_PORT ?? "4000")
const BUILD_DIR = join(import.meta.dir, "..", "build")

/** Recursively find the Electrobun launcher executable under the platform's build subdir. */
const resolveAppExecutable = (): string => {
  const platform = detectPlatform()
  const isExe = (p: string): boolean => {
    if (!statSync(p).isFile()) return false
    if (platform === "windows") return p.endsWith(".exe")
    // POSIX: the launcher has no extension and is executable.
    return !p.includes(".") || p.endsWith("LaunchKit")
  }
  const walk = (dir: string): string | null => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        const found = walk(full)
        if (found) return found
      } else if (isExe(full) && /launchkit/i.test(entry)) {
        return full
      }
    }
    return null
  }
  if (!existsSync(BUILD_DIR)) {
    throw new Error(`build dir not found: ${BUILD_DIR} (run the build first)`)
  }
  const exe = walk(BUILD_DIR)
  if (!exe)
    throw new Error(`could not locate a LaunchKit launcher under ${BUILD_DIR}`)
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
