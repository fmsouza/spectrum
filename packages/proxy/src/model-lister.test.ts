import { describe, expect, it } from "bun:test"
import type { SdkProvider } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import { createModelLister } from "./model-lister"
import type { HttpGet } from "./model-lister"
import type { ProxyError } from "./types"

// ── Fake HttpGet ─────────────────────────────────────────────────────────────

/** Builds an HttpGet fake that returns the canned body for any URL. */
const fakeHttpGet = (
  body: Result<unknown, ProxyError>,
  captureHeaders?: (headers: Readonly<Record<string, string>> | undefined) => void,
): HttpGet =>
  async (
    _url: string,
    headers?: Readonly<Record<string, string>>,
  ): Promise<Result<unknown, ProxyError>> => {
    if (captureHeaders) captureHeaders(headers)
    return body
  }

/** Builds an HttpGet fake that captures each call's url and headers for assertions. */
const capturingHttpGet = (
  body: Result<unknown, ProxyError>,
): {
  httpGet: HttpGet
  calls: Array<{ url: string; headers: Readonly<Record<string, string>> | undefined }>
} => {
  const calls: Array<{ url: string; headers: Readonly<Record<string, string>> | undefined }> = []
  const httpGet: HttpGet = async (url, headers) => {
    calls.push({ url, headers })
    return body
  }
  return { httpGet, calls }
}

// ── ollama ────────────────────────────────────────────────────────────────────

describe("createModelLister – ollama", () => {
  it("returns model names from /api/tags response", async () => {
    const body = {
      models: [
        { name: "llama3.2", digest: "abc" },
        { name: "mistral:latest", digest: "def" },
      ],
    }
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok(body)),
    })

    const result = await lister({
      sdkProvider: "ollama" as SdkProvider,
      config: {},
    })

    expect(result).toEqual({ ok: true, value: ["llama3.2", "mistral:latest"] })
  })

  it("uses the default ollama base URL when config has no baseUrl", async () => {
    const { httpGet, calls } = capturingHttpGet(ok({ models: [] }))
    const lister = createModelLister({ httpGet })

    await lister({ sdkProvider: "ollama" as SdkProvider, config: {} })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("http://localhost:11434/api/tags")
  })

  it("uses baseUrl from config when provided", async () => {
    const { httpGet, calls } = capturingHttpGet(ok({ models: [] }))
    const lister = createModelLister({ httpGet })

    await lister({
      sdkProvider: "ollama" as SdkProvider,
      config: { baseUrl: "http://my-ollama:8080" },
    })

    expect(calls[0]?.url).toBe("http://my-ollama:8080/api/tags")
  })

  it("sends NO Authorization header for ollama", async () => {
    const capturedHeaders: Array<Readonly<Record<string, string>> | undefined> = []
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ models: [] }), (h) => capturedHeaders.push(h)),
    })

    await lister({
      sdkProvider: "ollama" as SdkProvider,
      config: {},
      apiKey: "should-not-appear",
    })

    // headers should be undefined or not contain Authorization
    const h = capturedHeaders[0]
    expect(h?.["Authorization"]).toBeUndefined()
  })

  it("returns err on http error for ollama", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(err({ kind: "provider-failed", detail: "connection refused" })),
    })

    const result = await lister({ sdkProvider: "ollama" as SdkProvider, config: {} })

    expect(result.ok).toBe(false)
  })

  it("returns err when ollama response has no models field", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ wrong: "shape" })),
    })

    const result = await lister({ sdkProvider: "ollama" as SdkProvider, config: {} })

    expect(result.ok).toBe(false)
  })

  it("returns err when ollama models items have no name field", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ models: [{ digest: "abc" }] })),
    })

    const result = await lister({ sdkProvider: "ollama" as SdkProvider, config: {} })

    expect(result.ok).toBe(false)
  })
})

// ── OpenAI-compatible ─────────────────────────────────────────────────────────

describe("createModelLister – openai", () => {
  it("returns model ids from /v1/models response", async () => {
    const body = {
      data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
    }
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok(body)),
    })

    const result = await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-test",
    })

    expect(result).toEqual({ ok: true, value: ["gpt-4o", "gpt-4o-mini"] })
  })

  it("sends Bearer token in Authorization header", async () => {
    const capturedHeaders: Array<Readonly<Record<string, string>> | undefined> = []
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ data: [] }), (h) => capturedHeaders.push(h)),
    })

    await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-my-key",
    })

    expect(capturedHeaders[0]?.["Authorization"]).toBe("Bearer sk-my-key")
  })

  it("uses the default openai base URL when config has no baseUrl", async () => {
    const { httpGet, calls } = capturingHttpGet(ok({ data: [] }))
    const lister = createModelLister({ httpGet })

    await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-x",
    })

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/models")
  })

  it("uses baseUrl from config for openai-compatible provider", async () => {
    const { httpGet, calls } = capturingHttpGet(ok({ data: [] }))
    const lister = createModelLister({ httpGet })

    await lister({
      sdkProvider: "groq" as SdkProvider,
      config: { baseUrl: "https://api.groq.com/openai" },
      apiKey: "gsk-key",
    })

    expect(calls[0]?.url).toBe("https://api.groq.com/openai/v1/models")
  })

  it("returns err on http error for openai", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(err({ kind: "provider-failed", detail: "401 Unauthorized" })),
    })

    const result = await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-bad",
    })

    expect(result.ok).toBe(false)
  })

  it("returns err when openai response has no data field", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ wrong: "shape" })),
    })

    const result = await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-x",
    })

    expect(result.ok).toBe(false)
  })

  it("returns err when openai data items have no id field", async () => {
    const lister = createModelLister({
      httpGet: fakeHttpGet(ok({ data: [{ name: "gpt-4o" }] })),
    })

    const result = await lister({
      sdkProvider: "openai" as SdkProvider,
      config: {},
      apiKey: "sk-x",
    })

    expect(result.ok).toBe(false)
  })
})

// ── OpenAI-compatible variants ────────────────────────────────────────────────

describe.each([
  "groq",
  "xai",
  "fireworks",
  "perplexity",
  "cerebras",
  "mistral",
  "cohere",
] as SdkProvider[])(
  "createModelLister – %s (openai-compatible)",
  (sdkProvider) => {
    it(`returns model ids via /v1/models for ${sdkProvider}`, async () => {
      const lister = createModelLister({
        httpGet: fakeHttpGet(ok({ data: [{ id: "model-a" }] })),
      })

      const result = await lister({
        sdkProvider,
        config: {},
        apiKey: "key-for-test",
      })

      expect(result).toEqual({ ok: true, value: ["model-a"] })
    })
  },
)

// ── Unsupported providers ─────────────────────────────────────────────────────

describe.each([
  "anthropic",
  "google",
  "vertex",
  "bedrock",
  "azure",
] as SdkProvider[])(
  "createModelLister – %s (unsupported)",
  (sdkProvider) => {
    it(`returns unsupported-model-discovery err for ${sdkProvider}`, async () => {
      const lister = createModelLister({
        httpGet: fakeHttpGet(ok({})),
      })

      const result = await lister({
        sdkProvider,
        config: {},
        apiKey: "key",
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe("unsupported-model-discovery")
      }
    })
  },
)
