import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionIdSchema } from "@spectrum/types"
import {
  checkNativePtyAvailable,
  createNodePtySpawner,
  createTerminalManager,
} from "./index"
import type { TabId, TerminalOutbound } from "./protocol"
import type { PtySpawner } from "./pty-adapter"

const sessionId = SessionIdSchema.parse(
  "s_00000000-0000-4000-8000-000000000000",
)

const collectOutput = (sent: ReadonlyArray<TerminalOutbound>): string =>
  sent
    .filter(
      (m): m is Extract<TerminalOutbound, { type: "term-output" }> =>
        m.type === "term-output",
    )
    .map((m) => Buffer.from(m.data, "base64").toString())
    .join("")

/**
 * Smoke test that exercises the real `node-pty` native addon through
 * TerminalManager end-to-end: spawn → read → exit.
 *
 * Skipped cleanly when the addon isn't installed.
 *
 * Why we bypass `TerminalManager.launch`'s default command (the user's login
 * shell) and spawn `/bin/sh -c "echo hi"` directly:
 *
 *   - The test's purpose is to validate the **PTY lifecycle through
 *     TerminalManager** (spawn → onData → onExit → `term-exited` outbound),
 *     not the user's shell setup. Asserting on the login shell would couple
 *     the smoke test to whatever `.zshrc` / `.profile` / `nvm` / `oh-my-zsh`
 *     happens to be installed on a given machine.
 *   - On CI runners (macos-latest, windows-latest) the user's login shell
 *     either doesn't exist (Windows: no `/bin/zsh`) or starts so fast that
 *     `node-pty` reports the process as already exited before bun can
 *     deliver the first `term-input`. Bypassing the login shell keeps the
 *     spawn deterministic across machines.
 *   - `/bin/sh` is present on macOS, Linux, and (via `cmd.exe`) Windows;
 *     both shells load no user config and print `echo hi`'s output
 *     synchronously as part of their startup, so the `hi` assertion holds
 *     without any input write.
 */
describe.skipIf(!checkNativePtyAvailable())(
  "terminal smoke (real node-pty)",
  () => {
    it("spawns /bin/sh -c, captures stdout, and emits term-exited on close", async () => {
      const cwd = mkdtempSync(join(tmpdir(), "spectrum-term-"))

      // Force a deterministic command instead of `process.env.SHELL` (the
      // user's login shell), which varies wildly across environments and
      // is the root cause of the CI flake we're fixing.
      const isWin = process.platform === "win32"
      const command = isWin ? "cmd.exe" : "/bin/sh"
      const args = isWin ? ["/c", "echo hi"] : ["-c", "echo hi"]
      const baseSpawner = createNodePtySpawner()
      const spawner: PtySpawner = {
        spawn(input) {
          return baseSpawner.spawn({ ...input, command, args })
        },
      }

      const sent: TerminalOutbound[] = []
      const mgr = createTerminalManager({ spawner })
      mgr.bindSend((m) => sent.push(m))
      const tabId = "11111111-1111-4111-8111-111111111111" as TabId
      const r = mgr.launch({ sessionId, tabId, cwd, cols: 80, rows: 24 })
      expect(r.ok).toBe(true)
      if (!r.ok) throw new Error("launch failed; cannot continue smoke test")

      // Poll until either the shell prints `hi` or it exits. `/bin/sh -c`
      // exits as soon as `echo hi` returns, so term-exited may arrive
      // before all term-output chunks are delivered — we continue polling
      // a little longer after term-exited to drain any pending output.
      const echoDeadline = Date.now() + 10_000
      while (Date.now() < echoDeadline) {
        if (collectOutput(sent).includes("hi")) break
        if (sent.some((m) => m.type === "term-exited")) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      // Drain: a few short polls after term-exited to let any pending
      // term-output arrive before we assert.
      for (let i = 0; i < 10; i++) {
        if (collectOutput(sent).includes("hi")) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      // If the shell somehow hasn't exited (some Windows/cmd.exe runs
      // leave cmd open for a moment), close the terminal explicitly so
      // we exercise the `term-close` → kill() → term-exited path.
      if (!sent.some((m) => m.type === "term-exited")) {
        mgr.handleInbound({ type: "term-close", sessionId, tabId })
        const closeDeadline = Date.now() + 5_000
        while (Date.now() < closeDeadline) {
          if (sent.some((m) => m.type === "term-exited")) break
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      expect(collectOutput(sent)).toContain("hi")
      expect(sent.some((m) => m.type === "term-exited")).toBe(true)

      mgr.dispose(sessionId)
    }, 30_000)
  },
)
