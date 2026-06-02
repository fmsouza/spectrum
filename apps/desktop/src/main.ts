import { runCli } from "@launchkit/cli"
import { type ProxyHandle, type RunAppDeps, runApp } from "./app"
import { cliDepsFrom } from "./cli-deps"
import type { createAppContext } from "./composition"
import { detectMode } from "./detect-mode"
import { mountTray } from "./gui/tray"
import { openWindow } from "./gui/window"

/**
 * Build the `RunAppDeps` the mode router needs, wiring the real subsystems via `createAppContext`.
 * Exported (and parameterized by the factory + optional overrides) so it is unit-testable without
 * constructing real adapters or importing Electrobun at top level.
 *
 * SECURITY: the GUI proxy is started bound to loopback from `config.settings.proxyHost` via
 * `ctx.proxy.start(...)`, with a freshly generated per-run key — never `0.0.0.0`.
 */
export const buildRealDeps = (
  makeContext: typeof createAppContext,
  overrides: Partial<RunAppDeps> = {},
): RunAppDeps => {
  const ctx = makeContext()
  return {
    runCli: overrides.runCli ?? ((argv) => runCli(cliDepsFrom(ctx))(argv)),
    startProxy:
      overrides.startProxy ??
      ((): ProxyHandle => {
        // Load the live config so the GUI proxy's router knows the real providers + aliases.
        // A fresh install loads defaults (empty providers/aliases) — still loopback + valid.
        let stop = (): void => {}
        void ctx.config.load().then((loaded) => {
          if (!loaded.ok) return
          const running = ctx.proxy.start({
            host: loaded.value.settings.proxyHost,
            port: loaded.value.settings.proxyPort,
            proxyKey: ctx.genProxyKey(),
            config: loaded.value,
          })
          stop = running.stop
        })
        return { stop: () => stop() }
      }),
    openWindow:
      overrides.openWindow ??
      ((): void => {
        openWindow(ctx)
        void mountTray(ctx, {
          openWindow: () => openWindow(ctx),
          quit: () => process.exit(0),
        })
      }),
  }
}

/**
 * Entry wiring (pure, exported for testing): detect the mode from the raw argv, then run it.
 *
 * Both `bun run src/main.ts <verb>` and the compiled binary produce a `process.argv` shaped
 * `[runtime, scriptPath, ...userArgs]`. `detectMode` reads the verb at `argv[2]`, but
 * `runCli`/`parseArgs` treat the command as the first token — so the two-element prefix is dropped
 * before argv reaches `runApp`/`runCli`. Passing the raw argv through would make the CLI parse the
 * runtime path (`"bun"`) as the command.
 */
export const main = (
  argv: readonly string[],
  deps: RunAppDeps,
): Promise<void> => runApp(detectMode(argv), argv.slice(2), deps)
