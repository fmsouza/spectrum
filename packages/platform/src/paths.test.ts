import { describe, expect, it } from "bun:test"
import { resolveAppPaths } from "./paths"

const env = (e: Record<string, string | undefined> = {}) => e

describe("resolveAppPaths", () => {
  it("uses ~/Library/Application Support/LaunchKit on macOS", () => {
    const p = resolveAppPaths({
      platform: "macos",
      homeDir: "/Users/me",
      env: env(),
    })
    expect(p.dataDir).toBe("/Users/me/Library/Application Support/LaunchKit")
    expect(p.configFile).toBe(
      "/Users/me/Library/Application Support/LaunchKit/config.json",
    )
    expect(p.dbFile).toBe(
      "/Users/me/Library/Application Support/LaunchKit/launchkit.db",
    )
    expect(p.harnessDir).toBe(
      "/Users/me/Library/Application Support/LaunchKit/harnesses",
    )
    expect(p.runtimeFile).toBe(
      "/Users/me/Library/Application Support/LaunchKit/runtime.json",
    )
    expect(p.secretsDir).toBe(
      "/Users/me/Library/Application Support/LaunchKit/secrets",
    )
  })

  it("uses ~/.config/launchkit on Linux when XDG_CONFIG_HOME is unset", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env(),
    })
    expect(p.dataDir).toBe("/home/me/.config/launchkit")
    expect(p.configFile).toBe("/home/me/.config/launchkit/config.json")
  })

  it("honors XDG_CONFIG_HOME on Linux when it is set", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env({ XDG_CONFIG_HOME: "/cfg" }),
    })
    expect(p.dataDir).toBe("/cfg/launchkit")
  })

  it("uses %APPDATA%\\LaunchKit on Windows when APPDATA is set", () => {
    const p = resolveAppPaths({
      platform: "windows",
      homeDir: "C:\\Users\\me",
      env: env({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }),
    })
    expect(p.dataDir).toBe("C:\\Users\\me\\AppData\\Roaming\\LaunchKit")
    expect(p.configFile).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\LaunchKit\\config.json",
    )
  })

  it("falls back to ~/AppData/Roaming on Windows when APPDATA is unset", () => {
    const p = resolveAppPaths({
      platform: "windows",
      homeDir: "C:\\Users\\me",
      env: env(),
    })
    expect(p.dataDir).toBe("C:\\Users\\me\\AppData\\Roaming\\LaunchKit")
  })

  it("honors the LAUNCHKIT_DATA_DIR override on every platform", () => {
    const p = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/me",
      env: env({ LAUNCHKIT_DATA_DIR: "/custom/dir" }),
    })
    expect(p.dataDir).toBe("/custom/dir")
    expect(p.dbFile).toBe("/custom/dir/launchkit.db")
  })
})
