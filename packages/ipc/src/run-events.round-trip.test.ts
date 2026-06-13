import { describe, expect, it } from "bun:test"
import type { RunnerId, SessionId } from "@spectrum/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("getRunnerSocketUrl round-trip", () => {
  it("returns the runner socket url", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getRunnerSocketUrl"> = {
      getRunnerSocketUrl: async () => ({ url: "ws://localhost:5555/" }),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getRunnerSocketUrl(undefined)
    expect(r).toEqual({ ok: true, value: { url: "ws://localhost:5555/" } })
  })
})

describe("getRunEvents round-trip", () => {
  it("returns the stored events for the requested session", async () => {
    const pair = createMemoryTransportPair()
    let askedId: string | undefined
    const handlers: Pick<IpcHandlers, "getRunEvents"> = {
      getRunEvents: async (params) => {
        askedId = params.id
        return {
          events: [
            {
              seq: 0,
              sessionId: "s_42" as SessionId,
              ts: "2026-06-08T12:00:00.000Z",
              event: {
                type: "runner-started",
                runnerId: "r_root" as RunnerId,
                title: "T",
              },
            },
          ],
        }
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getRunEvents({ id: "s_42" as SessionId })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.events[0]?.event.type).toBe("runner-started")
    expect(askedId).toBe("s_42")
  })

  it("rejects a result whose event payload is not a valid CanonicalEvent", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getRunEvents"> = {
      getRunEvents: async () =>
        ({
          events: [
            {
              seq: 0,
              sessionId: "s_42" as SessionId,
              ts: "2026-06-08T12:00:00.000Z",
              event: { type: "nope" },
            },
          ],
        }) as never,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getRunEvents({ id: "s_42" as SessionId })
    expect(r.ok).toBe(false)
  })
})
