import { describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isLauncherEntry, resolveAppExecutable } from "./smoke"

describe("isLauncherEntry", () => {
  it("matches the Electrobun launcher on posix platforms", () => {
    expect(isLauncherEntry("launcher", "macos")).toBe(true)
    expect(isLauncherEntry("launcher", "linux")).toBe(true)
  })

  it("matches launcher.exe on windows (and rejects the bare name)", () => {
    expect(isLauncherEntry("launcher.exe", "windows")).toBe(true)
    expect(isLauncherEntry("launcher", "windows")).toBe(false)
  })

  it("accepts an app-named release binary as a fallback", () => {
    expect(isLauncherEntry("Spectrum", "macos")).toBe(true)
    expect(isLauncherEntry("Spectrum.exe", "windows")).toBe(true)
  })

  it("does NOT match the other executables bundled beside the launcher", () => {
    expect(isLauncherEntry("bun", "macos")).toBe(false)
    expect(isLauncherEntry("bspatch", "linux")).toBe(false)
    expect(isLauncherEntry("zig-zstd", "macos")).toBe(false)
  })
})

describe("resolveAppExecutable", () => {
  it("finds the launcher nested inside a macOS .app bundle, ignoring the bundled bun", () => {
    const root = mkdtempSync(join(tmpdir(), "lk-smoke-"))
    const macos = join(
      root,
      "dev-macos-arm64",
      "Spectrum-dev.app",
      "Contents",
      "MacOS",
    )
    mkdirSync(macos, { recursive: true })
    writeFileSync(join(macos, "bun"), "") // decoy executable that must be skipped
    writeFileSync(join(macos, "launcher"), "") // the real entry point
    expect(resolveAppExecutable(root, "macos")).toBe(join(macos, "launcher"))
  })

  it("finds launcher.exe in a Windows build layout", () => {
    const root = mkdtempSync(join(tmpdir(), "lk-smoke-win-"))
    const dir = join(root, "dev-win-x64", "Spectrum-dev")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "bun.exe"), "")
    writeFileSync(join(dir, "launcher.exe"), "")
    expect(resolveAppExecutable(root, "windows")).toBe(
      join(dir, "launcher.exe"),
    )
  })

  it("throws a clear error when no launcher exists", () => {
    const root = mkdtempSync(join(tmpdir(), "lk-smoke-empty-"))
    mkdirSync(join(root, "dev-macos-arm64"), { recursive: true })
    expect(() => resolveAppExecutable(root, "macos")).toThrow(
      /could not locate/,
    )
  })

  it("throws when the build dir is missing entirely", () => {
    expect(() =>
      resolveAppExecutable(
        join(tmpdir(), "lk-nonexistent-build-dir-xyz"),
        "macos",
      ),
    ).toThrow(/build dir not found/)
  })
})
