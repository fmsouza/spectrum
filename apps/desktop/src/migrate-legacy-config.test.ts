import { describe, expect, it } from "bun:test"
import {
  type MigrationFs,
  migrateLaunchkitToSpectrum,
  migrateLegacyMacosConfig,
} from "./migrate-legacy-config"

const fakeFs = (existing: ReadonlySet<string>) => {
  const copied: Array<{ from: string; to: string }> = []
  const markers: string[] = []
  const fs: MigrationFs = {
    exists: (p) => existing.has(p),
    copyDir: (from, to) => copied.push({ from, to }),
    writeMarker: (p) => markers.push(p),
    renameFile: () => {},
  }
  return { fs, copied, markers }
}

describe("migrateLegacyMacosConfig", () => {
  it("copies the legacy dir and writes a marker on macOS when only the legacy dir exists", () => {
    const { fs, copied, markers } = fakeFs(
      new Set(["/Users/me/.config/launchkit"]),
    )
    migrateLegacyMacosConfig(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(copied).toEqual([
      {
        from: "/Users/me/.config/launchkit",
        to: "/Users/me/Library/Application Support/Spectrum",
      },
    ])
    expect(markers).toEqual([
      "/Users/me/.config/launchkit/.migrated-to-app-support",
    ])
  })

  it("does nothing on macOS when the new data dir already exists", () => {
    const { fs, copied } = fakeFs(
      new Set([
        "/Users/me/.config/launchkit",
        "/Users/me/Library/Application Support/Spectrum",
      ]),
    )
    migrateLegacyMacosConfig(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(copied).toEqual([])
  })

  it("does nothing on linux even when the legacy dir exists", () => {
    const { fs, copied } = fakeFs(new Set(["/home/me/.config/launchkit"]))
    migrateLegacyMacosConfig(
      { platform: "linux", homeDir: "/home/me", env: {} },
      fs,
    )
    expect(copied).toEqual([])
  })
})

describe("migrateLaunchkitToSpectrum", () => {
  it("copies the old LaunchKit dir to Spectrum, renames the db, and marks the source", () => {
    const calls: Array<[string, string]> = []
    const markers: string[] = []
    const renames: Array<[string, string]> = []
    const oldDir = "/Users/me/Library/Application Support/LaunchKit"
    const newDir = "/Users/me/Library/Application Support/Spectrum"
    const fs: MigrationFs = {
      // old dir exists; new dir does not; the copied db file exists
      exists: (p) => p === oldDir || p === `${newDir}/launchkit.db`,
      copyDir: (from, to) => {
        calls.push([from, to])
      },
      writeMarker: (p) => {
        markers.push(p)
      },
      renameFile: (from, to) => {
        renames.push([from, to])
      },
    }
    migrateLaunchkitToSpectrum(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(calls).toEqual([[oldDir, newDir]])
    expect(renames).toEqual([
      [`${newDir}/launchkit.db`, `${newDir}/spectrum.db`],
    ])
    expect(markers).toEqual([`${oldDir}/.migrated-to-spectrum`])
  })

  it("is a no-op when the Spectrum dir already exists", () => {
    let copied = false
    const fs: MigrationFs = {
      exists: () => true, // new dir exists => plan is noop
      copyDir: () => {
        copied = true
      },
      writeMarker: () => {},
      renameFile: () => {},
    }
    migrateLaunchkitToSpectrum(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(copied).toBe(false)
  })

  it("skips the db rename when no launchkit.db exists in the copy", () => {
    const renames: Array<[string, string]> = []
    const oldDir = "/Users/me/Library/Application Support/LaunchKit"
    const fs: MigrationFs = {
      exists: (p) => p === oldDir, // old dir exists, new dir + db do NOT
      copyDir: () => {},
      writeMarker: () => {},
      renameFile: (from, to) => {
        renames.push([from, to])
      },
    }
    migrateLaunchkitToSpectrum(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(renames).toEqual([]) // guarded: no db file => no rename
  })
})
