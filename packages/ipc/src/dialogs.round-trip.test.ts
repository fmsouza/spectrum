import { describe, expect, it } from "bun:test"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("pickFolder round-trip", () => {
  it("returns the chosen path when the dialog confirms", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "pickFolder"> = {
      pickFolder: async () => ({ path: "/Users/fred/app" }),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.pickFolder({ startingFolder: "/Users/fred" })
    expect(r).toEqual({ ok: true, value: { path: "/Users/fred/app" } })
  })

  it("returns an empty path object when the dialog is cancelled", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "pickFolder"> = {
      pickFolder: async () => ({}),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.pickFolder(undefined)
    expect(r).toEqual({ ok: true, value: {} })
  })
})
