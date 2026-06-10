import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { createSequentialIdGen } from "@launchkit/utils"
import type { CreateCodexAdapterDeps } from "./adapter"
import { createCodexDriver } from "./driver"
import type { JsonRpcTransport } from "./transport"

const sync = (fn: () => void): void => fn()

const noopTransport = (thread: () => Promise<unknown>): JsonRpcTransport => ({
  dispatcher: {
    request: (method) =>
      method === "thread/start" ? thread() : Promise.resolve({}),
    notify: () => {},
    respond: () => {},
    respondError: () => {},
    feed: () => {},
    rejectAll: () => {},
  },
  close: () => {},
})

const fakeTransportFactory =
  (): NonNullable<CreateCodexAdapterDeps["createTransport"]> => () =>
    noopTransport(() => Promise.resolve({ thread: { id: "th_1" } }))

const failingTransportFactory =
  (): NonNullable<CreateCodexAdapterDeps["createTransport"]> => () =>
    noopTransport(() => Promise.reject(new Error("spawn failed")))

describe("createCodexDriver", () => {
  it("returns ok(session) synchronously with a minted rootRunnerId", () => {
    const driver = createCodexDriver({
      idGen: createSequentialIdGen(),
      scheduler: sync,
      createTransport: fakeTransportFactory(),
    })
    const started = driver.start({
      harnessId: "codex" as never,
      cwd: "/repo",
      env: {},
    })
    expect(started.ok && started.value.rootRunnerId.startsWith("rnr")).toBe(
      true,
    )
  })

  it("emits runner-finished(errored) when the app-server fails to start", async () => {
    const events: CanonicalEvent[] = []
    const driver = createCodexDriver({
      idGen: createSequentialIdGen(),
      scheduler: sync,
      createTransport: failingTransportFactory(),
    })
    const started = driver.start({
      harnessId: "codex" as never,
      cwd: "/repo",
      env: {},
    })
    if (!started.ok) throw new Error("expected ok")
    started.value.onEvent((e) => events.push(e))
    // Let the handshake awaits + the rejecting thread/start settle through the microtask queue.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(events.at(-1)).toMatchObject({
      type: "runner-finished",
      status: "errored",
    })
  })
})
