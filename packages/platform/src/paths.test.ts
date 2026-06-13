import { describe, expect, it } from "bun:test"
import { resolveAppPaths } from "./paths"

const env = (e: Record<string, string | undefined> = {}) => e

describe("resolveAppPaths", () => {
  it("uses ~/Library/Application Support/Spectrum on macOS", () => {
    const p = resolveAppPaths({
      platform: "macos",
      homeDir: "/Users/me",
      env: env(),
    })
    expect(p.dataDir).toBe("/Users/me/Library/Application Support/Spectrum")
    expect(p.configFile).toBe(
      "/Users/me/Library/Application Support/Spectrum/config.json",
    )
    expect(p.dbFile).toBe(
      "/Users/me/Library/Application Support/Spectrum/spectrum.db",
    )
    expect(p.harnessDir).toBe(
      "/Users/me/Library/Application Support/Spectrum/harnesses",
    )
    expect(p.runtimeFile).toBe(
      "/Users/me/Library/Application Support/Spectrum/runtime.json",
    )
    expect(p.secretsDir).toBe(
      "/Users/me/Library/Application Support/Spectrum/secrets",
    )
  })

  it("uses ~/.config/spectrum on Linux when XDG_CONFIG_HOME is unset", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env(),
    })
    expect(p.dataDir).toBe("/home/me/.config/spectrum")
    expect(p.configFile).toBe("/home/me/.config/spectrum/config.json")
  })

  it("honors XDG_CONFIG_HOME on Linux when it is set", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env({ XDG_CONFIG_HOME: "/cfg" }),
    })
    expect(p.dataDir).toBe("/cfg/spectrum")
  })

  it("uses %APPDATA%\\Spectrum on Windows when APPDATA is set", () => {
    const p = resolveAppPaths({
      platform: "windows",
      homeDir: "C:\\Users\\me",
      env: env({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }),
    })
    expect(p.dataDir).toBe("C:\\Users\\me\\AppData\\Roaming\\Spectrum")
    expect(p.configFile).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\Spectrum\\config.json",
    )
  })

  it("falls back to ~/AppData/Roaming on Windows when APPDATA is unset", () => {
    const p = resolveAppPaths({
      platform: "windows",
      homeDir: "C:\\Users\\me",
      env: env(),
    })
    expect(p.dataDir).toBe("C:\\Users\\me\\AppData\\Roaming\\Spectrum")
  })

  it("honors the SPECTRUM_DATA_DIR override on every platform", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env({ SPECTRUM_DATA_DIR: "/custom/dir" }),
    })
    expect(p.dataDir).toBe("/custom/dir")
    expect(p.dbFile).toBe("/custom/dir/spectrum.db")
  })
})
