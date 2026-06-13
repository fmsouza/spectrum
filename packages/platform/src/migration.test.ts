import { describe, expect, it } from "bun:test"
import { legacyMacosConfigDir, planLegacyMacosMigration } from "./migration"

const base = {
  homeDir: "/Users/me",
  env: {} as Record<string, string | undefined>,
}

describe("legacyMacosConfigDir", () => {
  it("points at ~/.config/launchkit", () => {
    expect(legacyMacosConfigDir("/Users/me")).toBe(
      "/Users/me/.config/launchkit",
    )
  })
})

describe("planLegacyMacosMigration", () => {
  it("plans a move on macOS when the legacy dir exists and the new dir does not", () => {
    const plan = planLegacyMacosMigration({
      platform: "macos",
      ...base,
      newDataDirExists: false,
      legacyDirExists: true,
    })
    expect(plan).toEqual({
      kind: "move",
      from: "/Users/me/.config/launchkit",
      to: "/Users/me/Library/Application Support/Spectrum",
    })
  })

  it("is a noop on macOS when the new data dir already exists", () => {
    const plan = planLegacyMacosMigration({
      platform: "macos",
      ...base,
      newDataDirExists: true,
      legacyDirExists: true,
    })
    expect(plan).toEqual({ kind: "noop" })
  })

  it("is a noop on macOS when the legacy dir does not exist", () => {
    const plan = planLegacyMacosMigration({
      platform: "macos",
      ...base,
      newDataDirExists: false,
      legacyDirExists: false,
    })
    expect(plan).toEqual({ kind: "noop" })
  })

  it("is always a noop on linux and windows", () => {
    for (const platform of ["linux", "windows"] as const) {
      expect(
        planLegacyMacosMigration({
          platform,
          ...base,
          newDataDirExists: false,
          legacyDirExists: true,
        }),
      ).toEqual({ kind: "noop" })
    }
  })
})
