import { describe, expect, it } from "bun:test"
import type { SessionId } from "@spectrum/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcMethods } from "./methods"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("renameSession round-trip", () => {
  it("forwards sessionId + name and returns null on success", async () => {
    const pair = createMemoryTransportPair()
    let received: IpcMethods["renameSession"]["params"] | undefined
    const handlers: Pick<IpcHandlers, "renameSession"> = {
      renameSession: async (params) => {
        received = params
        return null
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.renameSession({
      sessionId: "s_1" as SessionId,
      name: "New name",
    })
    expect(r).toEqual({ ok: true, value: null })
    expect(received).toEqual({
      sessionId: "s_1" as SessionId,
      name: "New name",
    })
  })

  it("rejects a blank name at the schema layer (min(1))", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "renameSession"> = {
      renameSession: async () => null,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.renameSession({
      sessionId: "s_1" as SessionId,
      name: "",
    })
    // The server validates params against the schema; a blank name fails validation
    // and surfaces as a result error (not a throw).
    expect(r.ok).toBe(false)
  })
})
