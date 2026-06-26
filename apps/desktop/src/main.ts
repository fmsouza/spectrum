import { runCli } from "@spectrum/cli"
import { type ProxyHandle, type RunAppDeps, runApp } from "./app"
import { cliDepsFrom } from "./cli-deps"
import type { GuiContext } from "./composition"
import { detectMode } from "./detect-mode"
import { mountAppMenu } from "./gui/app-menu"
import { enrichGuiPath } from "./gui/resolve-path"
import { mountTray } from "./gui/tray"
import { openWindow } from "./gui/window"

/**
 * Build the `RunAppDeps` the mode router needs, wiring the real subsystems via `createGuiContext`.
 * Exported (and parameterized by the factory + optional overrides) so it is unit-testable without
 * constructing real adapters or importing Electrobun at top level.
 *
 * SECURITY: the GUI proxy is started bound to loopback from `config.settings.proxyHost` via
 * `ctx.proxy.start(...)`, with a freshly generated per-run key — never `0.0.0.0`.
 */
export const buildRealDeps = (
  makeContext: () => GuiContext,
  overrides: Partial<RunAppDeps> = {},
): RunAppDeps => {
  const ctx = makeContext()
  return {
    runCli: overrides.runCli ?? ((argv) => runCli(cliDepsFrom(ctx))(argv)),
    startProxy:
      overrides.startProxy ??
      ((): ProxyHandle => {
        // GUI startup path only. A Finder/Dock-launched app inherits a minimal PATH that omits
        // the user's CLI install dirs (~/.local/bin, /opt/homebrew/bin, nvm/asdf shims), so
        // `Bun.which("claude")` returns null and every launch fails with "failed to resolve
        // harness launch". Reconstruct the real PATH (login-shell probe + static fallback) BEFORE
        // anything resolves a harness command. Synchronous so it is in place before the window
        // opens; CLI runs already inherit the full terminal PATH so this never runs there.
        const resolvedPath = enrichGuiPath()
        ctx.log.child("startup").info("resolved gui PATH", {
          entries: resolvedPath.split(":").length,
        })

        // Mark any sessions that were still "running" when the app was previously killed as ended.
        // The CLI must NOT call this: a live GUI proxy's sessions are genuinely running, and a CLI
        // invocation running alongside the GUI must not close them.
        const reconciled = ctx.sessions.reconcileOrphaned()
        if (!reconciled.ok) {
          // Non-fatal: log and continue rather than crashing GUI startup.
          // Redact to the SessionError discriminant (+ detail when present); never log secrets.
          ctx.log.child("startup").warn("reconcileOrphaned failed", {
            kind: reconciled.error.kind,
            ...("detail" in reconciled.error
              ? { detail: reconciled.error.detail }
              : {}),
          })
        }

        // Load the live config so the GUI proxy's router knows the real providers + models.
        // A fresh install loads defaults (empty providers/models) — still loopback + valid.
        let stop = (): void => {}
        void ctx.config.load().then((loaded) => {
          if (!loaded.ok) return
          // Capture the per-run key so we can both hand it to the proxy AND persist it for the
          // CLI to reuse (otherwise a CLI `launch` would mint a key this proxy rejects).
          const proxyKey = ctx.genProxyKey()
          const running = ctx.proxy.start({
            host: loaded.value.settings.proxyHost,
            port: ctx.proxyPort,
            proxyKey,
            config: loaded.value,
          })
          void ctx.runtime.writeProxyKey(proxyKey)
          stop = running.stop
        })
        return {
          stop: () => {
            ctx.log.child("startup").info("gui shutting down")
            stop()
            void ctx.runtime.clear()
          },
        }
      }),
    openWindow:
      overrides.openWindow ??
      ((): void => {
        // The native Edit menu (Copy/Paste/Cut/Select All) is REQUIRED for clipboard shortcuts to
        // reach the webview — without it Cmd+C/V do nothing in the conversation + composer.
        mountAppMenu()
        openWindow(ctx)
        ctx.log.child("startup").info("gui ready")
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
