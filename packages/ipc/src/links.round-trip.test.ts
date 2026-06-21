import { describe, expect, it } from "bun:test"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("openExternalUrl round-trip", () => {
  it("returns null when the handler opens the url", async () => {
    const pair = createMemoryTransportPair()
    const seen: string[] = []
    const handlers: Pick<IpcHandlers, "openExternalUrl"> = {
      openExternalUrl: async ({ url }) => {
        seen.push(url)
        return null
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.openExternalUrl({ url: "https://example.com" })
    expect(r).toEqual({ ok: true, value: null })
    expect(seen).toEqual(["https://example.com"])
  })

  it("rejects a non-url string at the param-validation layer", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "openExternalUrl"> = {
      openExternalUrl: async () => null,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    // An empty string fails the min(1) url schema → validation-failed Result.
    const r = await client.openExternalUrl({ url: "" })
    expect(r.ok).toBe(false)
  })
})
