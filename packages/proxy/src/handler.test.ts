import { describe, expect, it } from "bun:test"
import type { Config } from "@launchkit/config"
import { createScriptedGateway } from "./gateway"
import { createHandler } from "./handler"
import { createRouter } from "./router"
import { collectStream } from "./test-helpers"

const config = {
  version: 2,
  settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
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

const deps = (key: string) => ({
  proxyKey: key,
  router: createRouter(config),
  factory: { getModel: async () => ({ ok: true as const, value: {} }) },
  gateway: createScriptedGateway([
    { type: "text-delta", text: "Hi" },
    { type: "finish", finishReason: "stop" },
  ]),
  listModels: () => config.models.map((m) => m.id as string),
})

const handler = (key = "k") => createHandler(deps(key))
const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = { "x-api-key": "k" },
) =>
  new Request(`http://localhost:4000${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

describe("createHandler", () => {
  it("returns 200 for GET /health regardless of auth", async () => {
    const res = await handler().fetch(
      new Request("http://localhost:4000/health"),
    )
    expect(res.status).toBe(200)
  })
  it("returns 401 when a /v1/messages request has no proxy key", async () => {
    const res = await handler().fetch(
      post(
        "/v1/messages",
        {
          model: "mdl_default",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        },
        {},
      ),
    )
    expect(res.status).toBe(401)
  })
  it("streams Anthropic SSE when a valid /v1/messages request is made", async () => {
    const res = await handler().fetch(
      post("/v1/messages", {
        model: "mdl_default",
        max_tokens: 1,
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const body = await collectStream(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain("content_block_delta")
    expect(body).toContain("message_stop")
  })
  it("streams Responses API SSE when a valid /v1/responses request is made (codex)", async () => {
    const res = await handler().fetch(
      post("/v1/responses", {
        model: "mdl_default",
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hi" }],
          },
        ],
      }),
    )
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const body = await collectStream(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain("event: response.created")
    expect(body).toContain('"delta":"Hi"')
    expect(body).toContain("event: response.completed")
  })
  it("returns 400 when the model is unknown", async () => {
    const res = await handler().fetch(
      post("/v1/messages", {
        model: "ghost",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(res.status).toBe(400)
  })
  it("returns 502 provider-failed when the gateway errors without an upstream status", async () => {
    const res = await createHandler({
      ...deps("k"),
      gateway: createScriptedGateway([
        { type: "error", detail: "stream failed" },
      ]),
    }).fetch(
      post("/v1/messages", {
        model: "mdl_default",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(res.status).toBe(502)
    const json = (await res.json()) as {
      error: { kind: string; detail: string }
    }
    expect(json.error).toMatchObject({
      kind: "provider-failed",
      detail: "stream failed",
    })
  })
  it("passes through 429 with the provider's detail when the provider is rate limited", async () => {
    const res = await createHandler({
      ...deps("k"),
      gateway: createScriptedGateway([
        {
          type: "error",
          detail: "you have reached your session usage limit",
          statusCode: 429,
        },
      ]),
    }).fetch(
      post("/v1/messages", {
        model: "mdl_default",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(res.status).toBe(429)
    const json = (await res.json()) as {
      error: { kind: string; detail: string }
    }
    expect(json.error).toMatchObject({
      kind: "provider-failed",
      detail: "you have reached your session usage limit",
    })
  })
  it("lists the configured models for GET /v1/models", async () => {
    const res = await handler().fetch(
      new Request("http://localhost:4000/v1/models", {
        headers: { "x-api-key": "k" },
      }),
    )
    const json = (await res.json()) as { data: { id: string }[] }
    expect(json.data.map((m) => m.id)).toContain("mdl_default")
  })
})
