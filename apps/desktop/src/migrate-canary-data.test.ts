import { describe, expect, it } from "bun:test"
import { migrateProductionToCanary } from "./migrate-canary-data"
import type { MigrationFs } from "./migrate-legacy-config"

describe("migrateProductionToCanary", () => {
  it("copies the production dir into a new canary dir on first canary run", () => {
    const calls: Array<{ from: string; to: string }> = []
    const fs: MigrationFs = {
      exists: (p) =>
        p.includes("Application Support/Spectrum") && !p.includes("(Canary)"),
      copyDir: (from, to) => calls.push({ from, to }),
      writeMarker: () => {},
      renameFile: () => {},
    }
    migrateProductionToCanary(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(calls).toEqual([
      {
        from: "/Users/me/Library/Application Support/Spectrum",
        to: "/Users/me/Library/Application Support/Spectrum (Canary)",
      },
    ])
  })

  it("is a no-op when the canary dir already exists", () => {
    const calls: string[] = []
    const fs: MigrationFs = {
      exists: () => true,
      copyDir: (f) => calls.push(f),
      writeMarker: () => {},
      renameFile: () => {},
    }
    migrateProductionToCanary(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(calls).toEqual([])
  })

  it("is a no-op when no production dir exists", () => {
    const calls: string[] = []
    const fs: MigrationFs = {
      exists: (_p) => false,
      copyDir: (f) => calls.push(f),
      writeMarker: () => {},
      renameFile: () => {},
    }
    migrateProductionToCanary(
      { platform: "macos", homeDir: "/Users/me", env: {} },
      fs,
    )
    expect(calls).toEqual([])
  })
})
