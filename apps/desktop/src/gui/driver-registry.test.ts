import { describe, expect, it } from "bun:test"
import type { AgentDriver } from "@spectrum/agent-driver"
import { HarnessIdSchema } from "@spectrum/types"
import { ok } from "@spectrum/utils"
import { DEMO_HARNESS_ID, createDriverRegistry } from "./driver-registry"

const fakeDriver: AgentDriver = {
  start: () =>
    ok({
      rootRunnerId: "r" as never,
      onEvent: () => undefined,
      send: () => ok(undefined),
      respondApproval: () => ok(undefined),
      respondQuestion: () => ok(undefined),
      interrupt: () => ok(undefined),
      close: () => ok(undefined),
    }),
}

describe("createDriverRegistry", () => {
  it("returns the registered driver for a known harness id", () => {
    const registry = createDriverRegistry({ [DEMO_HARNESS_ID]: fakeDriver })
    expect(registry.get(HarnessIdSchema.parse(DEMO_HARNESS_ID))).toBe(
      fakeDriver,
    )
  })

  it("returns undefined for an unregistered harness id", () => {
    const registry = createDriverRegistry({ [DEMO_HARNESS_ID]: fakeDriver })
    expect(registry.get(HarnessIdSchema.parse("claude"))).toBeUndefined()
  })

  it("reports native=true for a registered harness and native=false otherwise", () => {
    const registry = createDriverRegistry({ [DEMO_HARNESS_ID]: fakeDriver })
    expect(registry.isNative(HarnessIdSchema.parse(DEMO_HARNESS_ID))).toBe(true)
    expect(registry.isNative(HarnessIdSchema.parse("claude"))).toBe(false)
  })

  it("is empty when constructed with no drivers (production default)", () => {
    const registry = createDriverRegistry({})
    expect(registry.get(HarnessIdSchema.parse(DEMO_HARNESS_ID))).toBeUndefined()
    expect(registry.isNative(HarnessIdSchema.parse(DEMO_HARNESS_ID))).toBe(
      false,
    )
  })
})
