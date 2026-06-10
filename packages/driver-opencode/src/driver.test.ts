import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { createSequentialIdGen, isOk } from "@launchkit/utils"
import { createOpencodeDriver } from "./driver"
import { S_ROOT } from "./fixtures/opencode-events"
import type { OpencodeClient, OpencodeEvent } from "./transport"

// A client whose stream immediately ends (the driver-wiring test cares about the sync session + root event).
const fakeClient = (): OpencodeClient => ({
  session: {
    create: async () => ({ id: S_ROOT }),
    prompt: async () => {},
    abort: async () => {},
    permissions: async () => {},
  },
  event: {
    subscribe: async () => ({
      stream: {
        async *[Symbol.asyncIterator](): AsyncGenerator<OpencodeEvent> {
          // Empty stream: yield nothing, end immediately.
          yield* [] as OpencodeEvent[]
        },
      },
    }),
  },
})

describe("createOpencodeDriver", () => {
  it("returns a session synchronously and emits the root runner-started after start", async () => {
    const events: CanonicalEvent[] = []
    const driver = createOpencodeDriver({
      idGen: createSequentialIdGen(),
      connect: async () => ({ client: fakeClient() }),
      scheduler: (fn) => fn(), // synchronous for the test
    })
    const started = driver.start({
      harnessId: "opencode" as never,
      cwd: "/w",
      env: {},
      initialPrompt: "hi",
    })
    expect(isOk(started)).toBe(true)
    if (!isOk(started)) return
    started.value.onEvent((e) => events.push(e))
    // The adapter is async (connect + create session); let it settle.
    await new Promise((r) => setTimeout(r, 0))
    expect(events.some((e) => e.type === "runner-started")).toBe(true)
  })
})
