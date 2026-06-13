import { describe, expect, it } from "bun:test"
import {
  legacyLaunchkitDataDir,
  planLaunchkitToSpectrumMigration,
} from "./spectrum-migration"

const env = {}

describe("legacyLaunchkitDataDir", () => {
  it("resolves the old macOS LaunchKit dir", () => {
    expect(
      legacyLaunchkitDataDir({ platform: "macos", homeDir: "/Users/me", env }),
    ).toBe("/Users/me/Library/Application Support/LaunchKit")
  })
  it("resolves the old Linux launchkit dir", () => {
    expect(
      legacyLaunchkitDataDir({ platform: "linux", homeDir: "/home/me", env }),
    ).toBe("/home/me/.config/launchkit")
  })
})

describe("planLaunchkitToSpectrumMigration", () => {
  it("moves when the old dir exists and the new one does not", () => {
    const plan = planLaunchkitToSpectrumMigration({
      platform: "macos",
      homeDir: "/Users/me",
      env,
      oldDirExists: true,
      newDirExists: false,
    })
    expect(plan).toEqual({
      kind: "move",
      from: "/Users/me/Library/Application Support/LaunchKit",
      to: "/Users/me/Library/Application Support/Spectrum",
    })
  })

  it("no-ops when the new dir already exists", () => {
    expect(
      planLaunchkitToSpectrumMigration({
        platform: "macos",
        homeDir: "/Users/me",
        env,
        oldDirExists: true,
        newDirExists: true,
      }).kind,
    ).toBe("noop")
  })

  it("no-ops when the old dir is absent", () => {
    expect(
      planLaunchkitToSpectrumMigration({
        platform: "linux",
        homeDir: "/home/me",
        env,
        oldDirExists: false,
        newDirExists: false,
      }).kind,
    ).toBe("noop")
  })
})
