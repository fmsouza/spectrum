import { describe, expect, it } from "bun:test"
import type { HarnessId } from "@spectrum/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("getHarnesses round-trip with native flag", () => {
  it("carries the per-harness native boolean across the wire", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getHarnesses"> = {
      getHarnesses: async () => [
        {
          id: "claude" as HarnessId,
          name: "Claude Code",
          command: "claude",
          apiFormat: "anthropic",
          envTemplate: {},
          builtIn: true,
          native: true,
        },
        {
          id: "aider" as HarnessId,
          name: "Aider",
          command: "aider",
          apiFormat: "openai",
          envTemplate: {},
          builtIn: true,
          native: false,
        },
      ],
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getHarnesses(undefined)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.find((h) => h.id === "claude")?.native).toBe(true)
    expect(r.value.find((h) => h.id === "aider")?.native).toBe(false)
  })

  it("rejects a harness-view result that is missing the native flag", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getHarnesses"> = {
      getHarnesses: async () =>
        [
          {
            id: "claude" as HarnessId,
            name: "Claude Code",
            command: "claude",
            apiFormat: "anthropic",
            envTemplate: {},
            builtIn: true,
          },
        ] as never,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getHarnesses(undefined)
    expect(r.ok).toBe(false)
  })
})
