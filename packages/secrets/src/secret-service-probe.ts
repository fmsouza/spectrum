import { isOk } from "@spectrum/utils"
import type { ProcessRunner } from "./process-runner"

const PROBE_ACCOUNT = "__spectrum_probe__"

// Substrings indicating the Secret Service / D-Bus session is unreachable (vs. a plain cache miss).
// Heuristic — may need tuning per distro.
const UNAVAILABLE_SIGNATURES = [
  "Cannot autolaunch",
  "Failed to connect",
  "org.freedesktop.DBus.Error",
  "Error spawning command line",
  "No such secret collection",
  "Cannot create an item in a locked collection",
] as const

/**
 * Is a usable Secret Service reachable? True iff `secret-tool` is installed AND a probe lookup does
 * not fail with a D-Bus/connection error (a plain "not found" means the service answered). Async, so
 * the keychain selector runs it lazily.
 */
export const isSecretServiceAvailable = async (deps: {
  readonly runner: ProcessRunner
  readonly commandExists?: (cmd: string) => boolean
  /** Service namespace to probe. Defaults to "spectrum". */
  readonly service?: string
}): Promise<boolean> => {
  const commandExists =
    deps.commandExists ?? ((c: string) => Bun.which(c) !== null)
  if (!commandExists("secret-tool")) return false
  const service = deps.service ?? "spectrum"
  const probe = await deps.runner.run("secret-tool", [
    "lookup",
    "service",
    service,
    PROBE_ACCOUNT,
  ])
  if (isOk(probe)) return true
  const detail = probe.error.kind === "backend-failed" ? probe.error.detail : ""
  return !UNAVAILABLE_SIGNATURES.some((sig) => detail.includes(sig))
}
