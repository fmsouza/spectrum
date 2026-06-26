import type { HarnessRegistry } from "@spectrum/harnesses"
import { type HarnessDefinition, HarnessIdSchema } from "@spectrum/types"
import { ok } from "@spectrum/utils"
import { DEMO_HARNESS_ID } from "./driver-registry"

/**
 * A DEV-ONLY harness whose runs are driven by the in-process `FakeDriver` (registered under the same
 * `DEMO_HARNESS_ID` in the driver registry). It exists so the native conversation view is launchable
 * from the New Session modal without a real harness binary.
 *
 * `command: "true"` is a universally-present no-op that satisfies `resolveLaunch`'s command-resolution
 * check (`Bun.which("true")`) but is NEVER spawned — the native (driver-backed) launch path in
 * `launchHarness` returns before `ctx.terminal.launch`, so no process starts. `envTemplate` is empty:
 * a demo launch uses the `direct` route (no model), which skips template rendering entirely.
 *
 * Gated by `SPECTRUM_DEMO_HARNESS=1` (see `createAppContext`) — production never sees it, so the
 * embedded terminal path for every real harness is unchanged.
 */
export const demoHarness: HarnessDefinition = {
  id: HarnessIdSchema.parse(DEMO_HARNESS_ID),
  name: "Demo (native · FakeDriver)",
  command: "true",
  apiFormat: "anthropic",
  envTemplate: {},
  builtIn: true,
}

/**
 * Decorate a `HarnessRegistry` so `list()` also returns {@link demoHarness} (appended after the real
 * harnesses). `add`/`remove` pass straight through. Applied in composition only when the dev demo flag
 * is set — without it, the demo harness is unreachable and nothing changes for production.
 */
export const withDemoHarness = (inner: HarnessRegistry): HarnessRegistry => ({
  list: async () => {
    const listed = await inner.list()
    if (!listed.ok) return listed
    return ok([...listed.value, demoHarness])
  },
  add: (definition) => inner.add(definition),
  remove: (id) => inner.remove(id),
})
