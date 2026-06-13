import { describe, expect, it } from "bun:test"
import type { HarnessId, Session, SessionId } from "@spectrum/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcMethods } from "./methods"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("launchHarness round-trip with extended params", () => {
  it("forwards name/cwd/env and returns the created sessionId", async () => {
    const pair = createMemoryTransportPair()
    let received: IpcMethods["launchHarness"]["params"] | undefined
    const handlers: Pick<IpcHandlers, "launchHarness"> = {
      launchHarness: async (params) => {
        received = params
        return { sessionId: "s_new" as SessionId }
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.launchHarness({
      id: "claude" as HarnessId,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
    expect(r).toEqual({ ok: true, value: { sessionId: "s_new" as SessionId } })
    expect(received).toEqual({
      id: "claude" as HarnessId,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
})

describe("getSessions round-trip with paging filter", () => {
  it("forwards running/limit/offset and returns the session list", async () => {
    const pair = createMemoryTransportPair()
    const session: Session = {
      id: "s_1" as SessionId,
      harnessId: "claude" as HarnessId,
      startedAt: "2026-05-23T10:00:00.000Z",
    }
    let filter: unknown
    const handlers: Pick<IpcHandlers, "getSessions"> = {
      getSessions: async (params) => {
        filter = params
        return [session]
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getSessions({ running: true, limit: 20, offset: 0 })
    expect(r).toEqual({ ok: true, value: [session] })
    expect(filter).toEqual({ running: true, limit: 20, offset: 0 })
  })
})
