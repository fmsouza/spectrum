import type { AgentDriver } from "@launchkit/agent-driver"
import { createDriver } from "@launchkit/driver-runtime"
import type { IdGen } from "@launchkit/utils"
import { createOpenclawAdapter } from "./adapter"
import type { OpenclawConnect } from "./transport"

export interface OpenclawDriverDeps {
  /** Mints runner ids (rnr prefix). */
  readonly idGen: IdGen
  /**
   * Connect to the OpenClaw Gateway. Defaults to the real connector (UNVERIFIED — built on the
   * documented Gateway WS protocol; there is no installed binary / published @openclaw/sdk to run).
   * Tests inject a fake.
   */
  readonly connect?: OpenclawConnect
  /** Schedules the async adapter start; defaults to queueMicrotask (forwarded to createDriver). */
  readonly scheduler?: (fn: () => void) => void
}

/**
 * Build the OpenClaw AgentDriver. Mirrors createClaudeDriver: wrap the per-harness adapter with the
 * shared runtime's createDriver. The connector is injected so the adapter logic is unit-testable.
 *
 * UNVERIFIED: no openclaw binary + no published @openclaw/sdk in this environment — the live transport
 * is documented-protocol-correct but not app-run-verified. See Plan 4 Task 7.
 */
export const createOpenclawDriver = (deps: OpenclawDriverDeps): AgentDriver =>
  createDriver({
    adapter: createOpenclawAdapter({
      connect: deps.connect ?? realOpenclawConnect,
    }),
    idGen: deps.idGen,
    ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
  })

/**
 * The real Gateway connector. UNVERIFIED stub-with-intent: throws a clear error until a published
 * @openclaw/sdk (or a raw Gateway WS / `openclaw acp` transport) is wired and a binary exists to verify
 * against. createDriver surfaces the rejection as runner-finished(errored), so a misconfigured launch
 * shows a native error state rather than crashing. NOTE: this is the ONLY unverified seam — every other
 * line in this package is unit-tested.
 */
const realOpenclawConnect: OpenclawConnect = async () => {
  throw new Error(
    "openclaw gateway transport not available: @openclaw/sdk is unreleased and no openclaw binary is installed (UNVERIFIED — see Plan 4 Task 7)",
  )
}
