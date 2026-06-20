import type { TimeoutWindows } from "../gateway"

/**
 * The generous watchdog floor for "buffered" providers (e.g. Ollama Cloud), which
 * emit zero bytes while computing the whole response server-side. 10 minutes — the
 * config max — so legitimate buffering never trips the watchdog; a genuinely dead
 * connection still surfaces eventually, and real provider errors surface instantly
 * via the deterministic error signal regardless of this value.
 */
const BUFFERED_FLOOR_MS = 600_000

/**
 * Pure: resolve the effective stream-watchdog windows for a provider. Incremental
 * providers use the user's settings verbatim. Buffered providers get each window
 * raised to at least the generous floor (never lowered below what the user chose).
 */
export const resolveTimeouts = (
  streaming: "incremental" | "buffered",
  settings: TimeoutWindows,
): TimeoutWindows => {
  if (streaming === "incremental") return settings
  return {
    firstTokenTimeoutMs: Math.max(settings.firstTokenTimeoutMs, BUFFERED_FLOOR_MS),
    interTokenTimeoutMs: Math.max(settings.interTokenTimeoutMs, BUFFERED_FLOOR_MS),
  }
}
