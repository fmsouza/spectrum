import { describe, expect, it } from "bun:test"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { ProviderView } from "./provider-view"
import { type IpcHandlers, createIpcServer } from "./server"

const sampleView: ProviderView = {
  id: "p_openai" as ProviderView["id"],
  name: "OpenAI",
  sdkProvider: "openai" as const,
  config: {},
  secretFields: { apiKey: { isSet: false } },
  models: ["gpt-4o"],
}

describe("createMemoryTransportPair", () => {
  it("round-trips a client call through a real server and handler", async () => {
    const { client: clientTransport, server: serverTransport } =
      createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProviders"> = {
      getProviders: async () => [sampleView],
    }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.getProviders(undefined)
    expect(r).toEqual({ ok: true, value: [sampleView] })
  })

  it("surfaces a server-side validation failure as a transport-failed Result on the client", async () => {
    const { client: clientTransport, server: serverTransport } =
      createMemoryTransportPair()
    let handlerRan = false
    const handlers: Pick<IpcHandlers, "addProvider"> = {
      addProvider: async () => {
        handlerRan = true
        return sampleView
      },
    }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.addProvider({ name: "" } as never)
    // Client-side param validation short-circuits first; handler never runs.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("validation-failed")
    expect(handlerRan).toBe(false)
  })

  it("propagates a handler throw to the client as a transport-failed error", async () => {
    const { client: clientTransport, server: serverTransport } =
      createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProxyStatus"> = {
      getProxyStatus: async () => {
        throw new Error("boom")
      },
    }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.getProxyStatus(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("transport-failed")
      expect(r.error.detail).toContain("handler-failed")
    }
  })

  it("throws when no server is wired to the pair", async () => {
    const { client: clientTransport } = createMemoryTransportPair()
    const client = createIpcClient(clientTransport)
    const r = await client.getProxyStatus(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("transport-failed")
  })
})
