import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { createSequentialIdGen, isOk } from "@launchkit/utils"
import { createOpenclawDriver } from "./driver"
import type { OpenClawEvent, OpenclawRun, OpenclawTransport } from "./transport"

const fakeTransport = (run: OpenclawRun): OpenclawTransport => ({
  run: () => run,
  send: () => {},
  disconnect: () => {},
})

// A run that emits a single root run.started then ends — enough to assert the createDriver wiring.
const oneShotRun = (): OpenclawRun => {
  const events = async function* (): AsyncIterable<OpenClawEvent> {
    yield {
      type: "event",
      event: "run.started",
      payload: { sessionKey: "s-root" },
    }
  }
  return {
    events,
    resolveApproval: () => {},
    cancel: () => {},
    close: () => {},
  }
}

describe("createOpenclawDriver", () => {
  it("returns a session synchronously and emits the root runner-started after start", async () => {
    const events: CanonicalEvent[] = []
    const run = oneShotRun()
    const driver = createOpenclawDriver({
      idGen: createSequentialIdGen(),
      connect: async () => fakeTransport(run),
      scheduler: (fn) => fn(), // synchronous for the test
    })
    const started = driver.start({
      harnessId: "openclaw" as never,
      cwd: "/w",
      env: {},
      initialPrompt: "hi",
    })
    expect(isOk(started)).toBe(true)
    if (!isOk(started)) return
    started.value.onEvent((e) => events.push(e))
    // The adapter is async; let it connect + start the run.
    await new Promise((r) => setTimeout(r, 0))
    expect(events.some((e) => e.type === "runner-started")).toBe(true)
  })
})
