import type { RunManager, RunnerOutbound } from "@spectrum/agent-driver"

/**
 * Compose a notifier tap into a RunManager's bound socket sink so run-event frames reach BOTH the
 * websocket and the tap, with exactly one active sink (no double-notify). The runner socket calls
 * `bindSend` on connect, REPLACING the manager's pre-connect sink; wrapping it here keeps the tap
 * firing both before AND after the webview connects, while only one sink is ever active per frame.
 */
export const withNotifierTap = (
  base: RunManager,
  tap: (message: RunnerOutbound) => void,
): RunManager => ({
  ...base,
  bindSend: (socketSink) => {
    base.bindSend((message) => {
      socketSink(message)
      tap(message)
    })
  },
})
