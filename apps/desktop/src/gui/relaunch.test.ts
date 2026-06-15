import { describe, expect, it } from "bun:test"
import { relaunchCommand } from "./relaunch"

describe("relaunchCommand", () => {
  it("builds a macOS open command from the app bundle derived from execPath when platform is darwin", () => {
    // The executable sits at <bundle>.app/Contents/MacOS/<binary>; the bundle is two dirs up.
    const cmd = relaunchCommand(
      "darwin",
      "/Applications/Spectrum.app/Contents/MacOS/spectrum",
      4242,
    )

    expect(cmd).toBeDefined()
    expect(cmd).toContain("/Applications/Spectrum.app")
    expect(cmd).toContain("open ")
    expect(cmd).toContain("kill -0 4242")
  })

  it("builds a launcher re-exec command referencing bin/launcher and the pid poll when platform is linux", () => {
    const cmd = relaunchCommand("linux", "/opt/spectrum/bin/spectrum", 777)

    expect(cmd).toBeDefined()
    expect(cmd).toContain("bin/launcher")
    expect(cmd).toContain("kill -0 777")
  })

  it("returns undefined for win32 (no shell command — caller just quits)", () => {
    const cmd = relaunchCommand("win32", "C:/Apps/Spectrum/spectrum.exe", 9)

    expect(cmd).toBeUndefined()
  })

  it("returns undefined for an unknown platform", () => {
    const cmd = relaunchCommand(
      "freebsd" as NodeJS.Platform,
      "/usr/local/bin/spectrum",
      1,
    )

    expect(cmd).toBeUndefined()
  })
})
