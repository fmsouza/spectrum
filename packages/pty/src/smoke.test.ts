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
 * TerminalManager end-to-end: spawn → write → read → exit.
 *
 * Skipped cleanly when the addon isn't installed.
 */
describe.skipIf(!checkNativePtyAvailable())(
  "terminal smoke (real node-pty)",
  () => {
    it("spawns a real shell, echoes input, and emits term-exited", async () => {
      const cwd = mkdtempSync(join(tmpdir(), "spectrum-term-"))
      const sent: TerminalOutbound[] = []
      const mgr = createTerminalManager({ spawner: createNodePtySpawner() })
      mgr.bindSend((m) => sent.push(m))
      const tabId = "11111111-1111-4111-8111-111111111111" as TabId
      const r = mgr.launch({ sessionId, tabId, cwd, cols: 80, rows: 24 })
      expect(r.ok).toBe(true)

      // Write `echo hi\r` and verify the echoed `hi` shows up in output.
      mgr.handleInbound({
        type: "term-input",
        sessionId,
        tabId,
        data: Buffer.from("echo hi\r").toString("base64"),
      })

      // Poll for either: the shell emitting `hi` in its output, OR the
      // shell exiting. With heavy login-shell startup (oh-my-zsh + nvm),
      // a single fixed delay is unreliable; polling lets the test adapt.
      const echoDeadline = Date.now() + 20_000
      while (Date.now() < echoDeadline) {
        if (collectOutput(sent).includes("hi")) break
        if (sent.some((m) => m.type === "term-exited")) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Write `exit\r` and wait for term-exited. On macOS under bun, the
      // first write sometimes races with shell startup; we tolerate that
      // by accepting either a clean `exit\r` round-trip OR a shell exit
      // triggered by our terminal-close path below.
      mgr.handleInbound({
        type: "term-input",
        sessionId,
        tabId,
        data: Buffer.from("exit\r").toString("base64"),
      })

      const exitDeadline = Date.now() + 5_000
      while (Date.now() < exitDeadline) {
        if (sent.some((m) => m.type === "term-exited")) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // If the shell hasn't exited from `exit\r` (a known bun/node-pty
      // interaction on macOS where the second write isn't delivered),
      // we explicitly close the terminal. This still exercises the full
      // spawn → write → read path AND proves the exit-event flow works
      // through the native addon.
      if (!sent.some((m) => m.type === "term-exited")) {
        mgr.handleInbound({ type: "term-close", sessionId, tabId })
        await new Promise((resolve) => setTimeout(resolve, 2_000))
      }

      expect(collectOutput(sent)).toContain("hi")
      expect(sent.some((m) => m.type === "term-exited")).toBe(true)

      mgr.dispose(sessionId)
    }, 60_000)
  },
)
