import type { Platform } from "./platform"

/**
 * The signal to terminate a child process. POSIX gets SIGTERM (graceful); Windows has no real
 * POSIX signal semantics, so we ask for SIGKILL (Node/Bun map it to TerminateProcess).
 */
export const defaultTerminationSignal = (platform: Platform): NodeJS.Signals =>
  platform === "windows" ? "SIGKILL" : "SIGTERM"
