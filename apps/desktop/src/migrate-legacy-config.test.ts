import { describe, expect, it } from "bun:test"
import {
  type MigrationFs,
  migrateLegacyMacosConfig,
} from "./migrate-legacy-config"

const fakeFs = (existing: ReadonlySet<string>) => {
  const copied: Array<{ from: string; to: string }> = []
  const markers: string[] = []
  const fs: MigrationFs = {
    exists: (p) => existing.has(p),
    copyDir: (from, to) => copied.push({ from, to }),
    writeMarker: (p) => markers.push(p),
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
