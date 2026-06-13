import { afterEach, describe, expect, it } from "bun:test"
import type { Config } from "@spectrum/config"
import { createScriptedGateway } from "./gateway"
import { createRouter } from "./router"
import { isProxyRunning, startProxy } from "./server"
import { collectStream } from "./test-helpers"

const config = {
  version: 2,
  settings: { proxyPort: 0, proxyHost: "127.0.0.1" },
  providers: [
    {
      id: "p1",
      name: "x",
      sdkProvider: "openai",
      config: {},
      secrets: {},
      models: [],
    },
  ],
  models: [{ id: "mdl_default", providerId: "p1", providerModel: "gpt-4o" }],
} as unknown as Config

let stop: (() => void) | undefined
afterEach(() => stop?.())

describe("startProxy", () => {
  it("binds loopback and answers /health when started", async () => {
    const s = startProxy({
      host: "127.0.0.1",
      port: 0,
      proxyKey: "k",
      router: createRouter(config),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([
        { type: "finish", finishReason: "stop" },
      ]),
      listModels: () => ["mdl_default"],
    })
    stop = s.stop
    expect(s.hostname).toBe("127.0.0.1")
    expect(await isProxyRunning(`http://127.0.0.1:${s.port}`)).toBe(true)
  })
  it("streams a /v1/messages response over a real socket", async () => {
    const s = startProxy({
      host: "127.0.0.1",
      port: 0,
      proxyKey: "k",
      router: createRouter(config),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([
        { type: "text-delta", text: "Hi" },
        { type: "finish", finishReason: "stop" },
      ]),
      listModels: () => ["mdl_default"],
    })
    stop = s.stop
    const res = await fetch(`http://127.0.0.1:${s.port}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": "k" },
      body: JSON.stringify({
        model: "mdl_default",
        max_tokens: 1,
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    })
    expect(
      await collectStream(res.body as ReadableStream<Uint8Array>),
    ).toContain("content_block_delta")
  })
})
