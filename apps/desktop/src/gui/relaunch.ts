/**
 * Factory-reset relaunch seam.
 *
 * Electrobun exposes no public `relaunch` API, so we reproduce the mechanism its own
 * post-update relaunch uses (observed in electrobun@1.18.1 `dist/api/bun/core/Updater.ts`,
 * the macOS/Linux launch block at the end of `applyUpdate`). A future Electrobun bump may
 * change that internal behavior and require revisiting this file.
 *
 * The per-platform COMMAND is built by the PURE `relaunchCommand` so it can be unit-tested
 * without native FFI. The effectful `defaultRelaunch` lazy-imports `electrobun/bun` and
 * `node:child_process` so `bun test` never loads native FFI (exactly like the `pickFolder`
 * and Electrobun updater seams).
 */

/** Effects `defaultRelaunch` needs, injected so the runner is testable without native FFI. */
export interface RelaunchDeps {
  readonly platform: NodeJS.Platform
  readonly execPath: string
  readonly pid: number
  /** Run `sh -c <cmd>` detached, fully disconnected from this process's stdio. */
  readonly spawnDetached: (cmd: string) => void
  /** Electrobun `Utils.quit()` — a graceful native shutdown. */
  readonly quit: () => void
}

/**
 * Build the detached shell command that re-launches the app once THIS process exits, or
 * `undefined` when the platform has no supported auto-relaunch (the caller then just quits).
 *
 * - darwin: the executable lives at `<bundle>.app/Contents/MacOS/<binary>`, so the bundle is
 *   two dirs up. `open` re-activates a still-running instance instead of launching a fresh one,
 *   so the detached shell must first wait for this pid to fully exit (`kill -0`), then re-open.
 * - linux: re-exec the bundle's `bin/launcher`. NOTE: this `execPath`-relative derivation
 *   (`<execPath>/../bin/launcher`) is an INDEPENDENT, UNVERIFIED assumption about our bundle
 *   layout — it is NOT parity with Electrobun, whose Linux relaunch targets a fixed app-data
 *   location (`$XDG_DATA_HOME` / `~/.local/share/.../app`). Relaunch is best-effort here (the
 *   data wipe has already succeeded by the time this runs), so an honest, simple derivation is
 *   acceptable; revisit if Linux auto-relaunch proves unreliable.
 * - win32 / unknown: `undefined` — no shell relaunch (see `defaultRelaunch`).
 */
export const relaunchCommand = (
  platform: NodeJS.Platform,
  execPath: string,
  pid: number,
): string | undefined => {
  // Lightweight, dependency-free path math so this stays pure (no node:path import).
  const dirOf = (p: string): string => {
    const idx = p.replace(/\\/g, "/").lastIndexOf("/")
    return idx <= 0 ? p : p.slice(0, idx)
  }
  const waitForExit = `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done; sleep 1;`

  if (platform === "darwin") {
    const macosDir = dirOf(execPath) // <bundle>.app/Contents/MacOS
    const contentsDir = dirOf(macosDir) // <bundle>.app/Contents
    const bundlePath = dirOf(contentsDir) // <bundle>.app
    return `${waitForExit} open "${bundlePath}"`
  }
  if (platform === "linux") {
    const binDir = dirOf(execPath) // <bundle>/bin
    const bundlePath = dirOf(binDir) // <bundle>
    const launcherPath = `${bundlePath}/bin/launcher`
    return `${waitForExit} "${launcherPath}" &`
  }
  // win32 + any unknown platform: no supported shell relaunch.
  return undefined
}

/**
 * Effectful relaunch default wired into the composition root's `realDeps`. Lazy-imports
 * `electrobun/bun` (for `Utils.quit`) and `node:child_process` so `bun test` never loads native
 * FFI. Fire-and-forget: it ends the process, so it returns `void` and the async work is not awaited.
 *
 * Windows: auto-relaunch is NOT yet supported (we deliberately do not reproduce Electrobun's
 * Windows `.bat` relaunch). Since the factory-reset data wipe has already succeeded by the time
 * this runs, the safe behavior is to cleanly quit so the destructive op completes and the user
 * reopens the app manually — NEVER fall through to the Linux `sh`/`kill -0`/`bin/launcher` path,
 * none of which exist on Windows.
 */
export const defaultRelaunch = (): void => {
  void (async (): Promise<void> => {
    const { Utils } = await import("electrobun/bun")
    const cmd = relaunchCommand(process.platform, process.execPath, process.pid)
    if (cmd !== undefined) {
      const { spawn } = await import("node:child_process")
      spawn("sh", ["-c", cmd], {
        detached: true,
        stdio: "ignore",
      }).unref()
    }
    // win32 / unknown: no relaunch command — just quit cleanly (manual reopen).
    Utils.quit()
  })()
}
