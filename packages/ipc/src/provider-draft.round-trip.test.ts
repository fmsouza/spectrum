import { describe, expect, it } from "bun:test"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import {
  AddProviderParamsSchema,
  ListProviderModelsDraftParamsSchema,
  TestProviderDraftParamsSchema,
} from "./methods"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("TestProviderDraftParamsSchema", () => {
  it("parses inline sdkProvider/config/secrets/providerModel", () => {
    const r = TestProviderDraftParamsSchema.parse({
      sdkProvider: "openai",
      config: { serverUrl: "https://api.openai.com/v1" },
      secrets: { apiKey: "sk-x" },
      providerModel: "gpt-4o",
    })
    expect(r.secrets.apiKey).toBe("sk-x")
  })
  it("rejects extra keys (strict)", () => {
    expect(
      TestProviderDraftParamsSchema.safeParse({
        sdkProvider: "openai",
        config: {},
        secrets: {},
        providerModel: "",
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("ListProviderModelsDraftParamsSchema", () => {
  it("parses inline sdkProvider/config/secrets", () => {
    const r = ListProviderModelsDraftParamsSchema.parse({
      sdkProvider: "ollama",
      config: { serverUrl: "https://ollama.com/api" },
      secrets: { apiKey: "k" },
    })
    expect(r.sdkProvider).toBe("ollama")
  })
})

describe("AddProviderParamsSchema with inline secrets", () => {
  it("accepts an optional secrets record", () => {
    const r = AddProviderParamsSchema.parse({
      sdkProvider: "ollama",
      config: {},
      secretFieldNames: ["apiKey"],
      secrets: { apiKey: "sk-live" },
      models: ["qwen2.5-coder"],
    })
    expect(r.secrets).toEqual({ apiKey: "sk-live" })
  })
  it("still parses without secrets (keyless / deferred)", () => {
    const r = AddProviderParamsSchema.parse({
      sdkProvider: "openai",
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })
    expect(r.secrets).toBeUndefined()
  })
  it("rejects unknown keys (strict)", () => {
    expect(
      AddProviderParamsSchema.safeParse({
        sdkProvider: "openai",
        config: {},
        secretFieldNames: [],
        models: [],
        bogus: 1,
      }).success,
    ).toBe(false)
  })
})

describe("draft round-trip", () => {
  it("forwards testProviderDraft inputs and returns ok+latency", async () => {
    const pair = createMemoryTransportPair()
    let received: unknown
    const handlers: Pick<IpcHandlers, "testProviderDraft"> = {
      testProviderDraft: async (input) => {
        received = input
        return { ok: true, latencyMs: 42 }
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.testProviderDraft({
      sdkProvider: "openai",
      config: {},
      secrets: { apiKey: "sk-x" },
      providerModel: "gpt-4o",
    })
    expect(r).toEqual({ ok: true, value: { ok: true, latencyMs: 42 } })
    expect(TestProviderDraftParamsSchema.parse(received).secrets.apiKey).toBe(
      "sk-x",
    )
  })
})
