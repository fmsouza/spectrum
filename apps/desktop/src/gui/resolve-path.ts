import { homedir } from "node:os"
import {
  type Platform,
  commonBinDirs,
  detectPlatform,
  loginShellPathProbe,
  mergePathEntries,
  parseLoginShellPath,
  pathDelimiter,
} from "@spectrum/platform"

/**
 * Synchronously run a shell command and return its stdout, or null on any failure.
 * The single spawn effect behind `resolveGuiPath`'s `probeShellPath` seam.
 */
export type ShellPathProbe = (
  command: string,
  args: readonly string[],
) => string | null

export interface ResolveGuiPathDeps {
  readonly platform: Platform
  readonly homeDir: string
  /** The inherited PATH (`process.env.PATH`) — minimal when launched from Finder/Dock. */
  readonly basePath: string | undefined
  /** The user's login shell (`process.env.SHELL`); when absent, only the static dirs are used. */
  readonly shell: string | undefined
  readonly probeShellPath: ShellPathProbe
}

/**
 * Compute the PATH a GUI-launched process should search: the user's real login-shell
 * PATH (so version-manager shims like nvm/asdf are found) prepended to the inherited
 * minimal PATH, with the well-known install dirs as a static fallback. Pure given the
 * injected `probeShellPath`. See `@spectrum/platform`'s path-env helpers.
 */
export const resolveGuiPath = (deps: ResolveGuiPathDeps): string => {
  const shellEntries = ((): readonly string[] => {
    if (deps.shell === undefined || deps.shell === "") return []
    const probe = loginShellPathProbe(deps.shell)
    const stdout = deps.probeShellPath(probe.command, probe.args)
    if (stdout === null) return []
    const parsed = parseLoginShellPath(stdout)
    if (parsed === null) return []
    return parsed.split(pathDelimiter(deps.platform)).filter((e) => e !== "")
  })()
  const additions = [
    ...shellEntries,
    ...commonBinDirs({ platform: deps.platform, homeDir: deps.homeDir }),
  ]
  return mergePathEntries(deps.basePath, additions, deps.platform)
}

/** Real probe: a synchronous `Bun.spawnSync` so PATH is ready before any launch. */
const realProbeShellPath: ShellPathProbe = (command, args) => {
  try {
    const r = Bun.spawnSync([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (!r.success) return null
    return r.stdout.toString()
  } catch {
    return null
  }
}

/**
 * GUI startup effect: resolve the user's real PATH and write it to `process.env.PATH`
 * so the harness command resolver (`Bun.which`) and spawned child processes can find
 * CLIs the Finder/Dock-inherited PATH omits. Returns the resolved PATH. GUI-only — the
 * CLI already inherits the user's full terminal PATH, and this would add shell-spawn
 * latency to its cold start. The probe is injectable for tests.
 */
export const enrichGuiPath = (
  probeShellPath: ShellPathProbe = realProbeShellPath,
): string => {
  const next = resolveGuiPath({
    platform: detectPlatform(),
    homeDir: homedir(),
    basePath: process.env.PATH,
    shell: process.env.SHELL,
    probeShellPath,
  })
  process.env.PATH = next
  return next
}
