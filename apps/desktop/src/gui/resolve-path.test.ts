import { describe, expect, it } from "bun:test"
import { PATH_SENTINEL_END, PATH_SENTINEL_START } from "@spectrum/platform"
import { resolveGuiPath } from "./resolve-path"

const wrap = (path: string): string =>
  `banner line\n${PATH_SENTINEL_START}${path}${PATH_SENTINEL_END}\n`

describe("resolveGuiPath", () => {
  it("prepends the login-shell PATH ahead of the inherited base", () => {
    const result = resolveGuiPath({
      platform: "macos",
      homeDir: "/Users/me",
      basePath: "/usr/bin:/bin",
      shell: "/bin/zsh",
      probeShellPath: () => wrap("/Users/me/.nvm/versions/node/v24/bin"),
    })
    const entries = result.split(":")
    // The version-manager shim the GUI's minimal PATH lacked must now come first.
    expect(entries[0]).toBe("/Users/me/.nvm/versions/node/v24/bin")
    expect(entries).toContain("/usr/bin")
  })

  it("invokes the shell probe with an interactive login shell command", () => {
    const calls: Array<{ command: string; args: readonly string[] }> = []
    resolveGuiPath({
      platform: "macos",
      homeDir: "/Users/me",
      basePath: "/usr/bin",
      shell: "/bin/zsh",
      probeShellPath: (command, args) => {
        calls.push({ command, args })
        return wrap("/opt/x/bin")
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("/bin/zsh")
    expect(calls[0]?.args[0]).toBe("-ilc")
  })

  it("falls back to the common bin dirs when the shell probe fails", () => {
    const result = resolveGuiPath({
      platform: "macos",
      homeDir: "/Users/me",
      basePath: "/usr/bin",
      shell: "/bin/zsh",
      probeShellPath: () => null,
    })
    expect(result).toContain("/Users/me/.local/bin")
    expect(result).toContain("/opt/homebrew/bin")
    expect(result).toContain("/usr/bin")
  })

  it("does not probe and still includes common bin dirs when no shell is set", () => {
    let probed = false
    const result = resolveGuiPath({
      platform: "macos",
      homeDir: "/Users/me",
      basePath: "/usr/bin",
      shell: undefined,
      probeShellPath: () => {
        probed = true
        return wrap("/should/not/be/used")
      },
    })
    expect(probed).toBe(false)
    expect(result).toContain("/Users/me/.local/bin")
    expect(result).not.toContain("/should/not/be/used")
  })

  it("de-duplicates so an entry present in both the shell PATH and base appears once", () => {
    const result = resolveGuiPath({
      platform: "macos",
      homeDir: "/Users/me",
      basePath: "/usr/bin:/usr/local/bin",
      shell: "/bin/zsh",
      probeShellPath: () => wrap("/usr/local/bin"),
    })
    const occurrences = result.split(":").filter((e) => e === "/usr/local/bin")
    expect(occurrences).toHaveLength(1)
  })
})
