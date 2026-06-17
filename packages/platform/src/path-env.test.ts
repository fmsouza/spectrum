import { describe, expect, it } from "bun:test"
import {
  PATH_SENTINEL_END,
  PATH_SENTINEL_START,
  commonBinDirs,
  loginShellPathProbe,
  mergePathEntries,
  parseLoginShellPath,
} from "./path-env"

describe("mergePathEntries", () => {
  it("prepends the additions ahead of the existing PATH on posix", () => {
    const result = mergePathEntries(
      "/usr/bin:/bin",
      ["/Users/me/.local/bin"],
      "macos",
    )
    expect(result).toBe("/Users/me/.local/bin:/usr/bin:/bin")
  })

  it("de-duplicates entries, keeping the first occurrence", () => {
    const result = mergePathEntries(
      "/usr/bin:/usr/local/bin",
      ["/usr/local/bin", "/opt/homebrew/bin"],
      "macos",
    )
    expect(result).toBe("/usr/local/bin:/opt/homebrew/bin:/usr/bin")
  })

  it("drops empty segments from a trailing/leading colon", () => {
    const result = mergePathEntries("/usr/bin:", ["/opt/bin"], "macos")
    expect(result).toBe("/opt/bin:/usr/bin")
  })

  it("treats an undefined base as empty", () => {
    expect(mergePathEntries(undefined, ["/opt/bin"], "macos")).toBe("/opt/bin")
  })

  it("uses ';' as the delimiter on windows", () => {
    const result = mergePathEntries(
      "C:\\Windows",
      ["C:\\Users\\me\\bin"],
      "windows",
    )
    expect(result).toBe("C:\\Users\\me\\bin;C:\\Windows")
  })
})

describe("commonBinDirs", () => {
  it("includes the user's ~/.local/bin and homebrew/usr-local on macos", () => {
    const dirs = commonBinDirs({ platform: "macos", homeDir: "/Users/me" })
    expect(dirs).toContain("/Users/me/.local/bin")
    expect(dirs).toContain("/opt/homebrew/bin")
    expect(dirs).toContain("/usr/local/bin")
  })

  it("includes ~/.local/bin on linux", () => {
    const dirs = commonBinDirs({ platform: "linux", homeDir: "/home/me" })
    expect(dirs).toContain("/home/me/.local/bin")
    expect(dirs).toContain("/usr/local/bin")
  })
})

describe("loginShellPathProbe", () => {
  it("builds an interactive login-shell command that prints PATH between sentinels", () => {
    const probe = loginShellPathProbe("/bin/zsh")
    expect(probe.command).toBe("/bin/zsh")
    expect(probe.args[0]).toBe("-ilc")
    // The script must reference the live $PATH (braced, so the sentinel can't merge
    // into the variable name) and wrap it in the sentinels so the value can be
    // recovered even when an interactive shell prints a banner.
    expect(probe.args[1]).toContain("${PATH}")
    expect(probe.args[1]).toContain(PATH_SENTINEL_START)
    expect(probe.args[1]).toContain(PATH_SENTINEL_END)
  })
})

describe("loginShellPathProbe round-trips through a real POSIX shell", () => {
  it("recovers the live $PATH the shell was given", () => {
    // The script must expand $PATH correctly even though a sentinel immediately
    // follows it — a naive `$PATH__SENTINEL__` is parsed as one variable name and
    // expands to empty, swallowing the closing sentinel. Run the actual script
    // through /bin/sh with a known PATH to prove the value is recovered.
    const probe = loginShellPathProbe("/bin/sh")
    const script = probe.args[1] ?? ""
    const wanted = "/tmp/aaa:/tmp/bbb"
    const r = Bun.spawnSync(["/bin/sh", "-c", script], {
      env: { PATH: wanted },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(r.success).toBe(true)
    expect(parseLoginShellPath(r.stdout.toString())).toBe(wanted)
  })
})

describe("parseLoginShellPath", () => {
  it("extracts the PATH between the sentinels, ignoring surrounding banner noise", () => {
    const stdout = `Welcome to your shell!\n${PATH_SENTINEL_START}/Users/me/.local/bin:/usr/bin${PATH_SENTINEL_END}\nsome trailing rc output`
    expect(parseLoginShellPath(stdout)).toBe("/Users/me/.local/bin:/usr/bin")
  })

  it("returns null when the sentinels are absent", () => {
    expect(parseLoginShellPath("no sentinels here")).toBeNull()
  })

  it("returns null when the extracted PATH is empty", () => {
    expect(
      parseLoginShellPath(`${PATH_SENTINEL_START}${PATH_SENTINEL_END}`),
    ).toBeNull()
  })
})
