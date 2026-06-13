import type { AgentDriver } from "@spectrum/agent-driver"
import type { HarnessId } from "@spectrum/types"

/** The dev-only harness id backed by the FakeDriver. Registering ANY real harness here is out of scope. */
export const DEMO_HARNESS_ID = "demo" as const

export interface DriverRegistry {
  /** The driver registered for this harness, or undefined if the harness still uses the terminal. */
  get(harnessId: HarnessId): AgentDriver | undefined
  /** True when this harness launches natively via the RunManager (a driver is registered). */
  isNative(harnessId: HarnessId): boolean
}

/**
 * Map harnessId → AgentDriver. Harnesses absent from the map fall through to the embedded-terminal
 * path UNCHANGED. Production passes `{}` (or only the demo harness behind a dev guard), so existing
 * harness behavior is untouched.
 */
export const createDriverRegistry = (
  drivers: Readonly<Record<string, AgentDriver>>,
): DriverRegistry => ({
  get: (harnessId) => drivers[String(harnessId)],
  isNative: (harnessId) => drivers[String(harnessId)] !== undefined,
})
