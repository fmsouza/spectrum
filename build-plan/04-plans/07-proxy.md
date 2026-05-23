# @launchkit/proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The HTTP proxy that harnesses talk to: parse inbound Anthropic/OpenAI requests into a normalized shape, resolve a model alias to a provider, call the provider through the Vercel AI SDK, and **stream** the response back in the harness's wire format — on loopback only, key-authenticated, never buffering.

**Architecture:** The whole hot path is built from small pure functions plus **two injected effect seams** that keep it fully unit-testable without a network: (1) a `ProviderFactory` that turns a `Provider` into an AI-SDK model handle (resolving secrets, lazy-loading the SDK package, caching by config hash); (2) a `LanguageModelGateway` that runs the actual `streamText()` call and yields normalized `StreamEvent`s. Adapters parse requests and serialize `StreamEvent`s to SSE. Tests inject fakes for both seams; one integration test wires the real AI SDK against a mock model.

**Tech Stack:** TypeScript (strict), Bun (`Bun.serve`), `ai` + `@ai-sdk/*` (pinned, lazy-imported), `zod`, `bun:test`.

> Depends on: `types`, `utils`, `config`, `secrets`. Read `01-conventions/performance.md` (stream-never-buffer, cache instances, lazy import) and `security.md` (loopback-only, per-run key, validate input). Create the package via `launchkit-new-package`; add deps `ai`, `zod`, and the `@ai-sdk/*` packages **pinned**.
> **AI SDK note:** confirm the exact `streamText()` call signature + stream part shapes against the installed `ai` version (use context7 or the AI SDK docs) when implementing `proxy-09`/`proxy-12`. This plan pins the *internal* `StreamEvent` contract; only the thin real-gateway wrapper touches the SDK's exact API. If it diverges materially, adapt the wrapper (not the rest) and note it.

---

### Task proxy-01: Internal request/stream types + ProxyError

**Files:** Create `packages/proxy/src/types.ts`; Test `types.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { NormalizedRequestSchema } from "./types"

describe("NormalizedRequestSchema", () => {
  it("parses a minimal normalized request with one user message", () => {
    const req = { model: "default", messages: [{ role: "user", content: "hi" }], stream: true }
    expect(NormalizedRequestSchema.parse(req)).toMatchObject(req)
  })
  it("rejects a request with an empty messages array", () => {
    expect(NormalizedRequestSchema.safeParse({ model: "default", messages: [], stream: true }).success).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement `types.ts`**

```typescript
import { z } from "zod"

export const NormalizedMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
}).strict()
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>

export const NormalizedRequestSchema = z.object({
  model: z.string().min(1),                 // the alias name the harness asked for
  system: z.string().optional(),
  messages: z.array(NormalizedMessageSchema).min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean(),
}).strict()
export type NormalizedRequest = z.infer<typeof NormalizedRequestSchema>

/** Normalized streaming event — the contract between the gateway and the serializers. */
export type StreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "finish"; readonly finishReason: string; readonly usage?: { readonly inputTokens: number; readonly outputTokens: number } }
  | { readonly type: "error"; readonly detail: string }

export type ProxyError =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "bad-request"; readonly detail: string }
  | { readonly kind: "unknown-alias"; readonly alias: string }
  | { readonly kind: "unknown-provider"; readonly providerId: string }
  | { readonly kind: "unsupported-provider"; readonly sdkProvider: string }
  | { readonly kind: "provider-failed"; readonly detail: string }
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add normalized types + ProxyError [proxy-01]`.

---

### Task proxy-02: Request authentication

**Files:** Create `packages/proxy/src/auth.ts`; Test `auth.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { checkAuth } from "./auth"

const KEY = "secret-proxy-key"

describe("checkAuth", () => {
  it("accepts a request with a matching Bearer token", () => {
    expect(checkAuth(new Headers({ authorization: `Bearer ${KEY}` }), KEY)).toEqual({ ok: true, value: undefined })
  })
  it("accepts a request with a matching x-api-key header", () => {
    expect(checkAuth(new Headers({ "x-api-key": KEY }), KEY)).toEqual({ ok: true, value: undefined })
  })
  it("returns unauthorized when no credential is present", () => {
    expect(checkAuth(new Headers(), KEY)).toEqual({ ok: false, error: { kind: "unauthorized" } })
  })
  it("returns unauthorized when the credential does not match", () => {
    expect(checkAuth(new Headers({ "x-api-key": "wrong" }), KEY)).toEqual({ ok: false, error: { kind: "unauthorized" } })
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (constant-time compare to avoid timing leaks)

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { ProxyError } from "./types"

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const checkAuth = (headers: Headers, proxyKey: string): Result<void, ProxyError> => {
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const apiKey = headers.get("x-api-key") ?? undefined
  const presented = bearer ?? apiKey
  if (presented !== undefined && constantTimeEquals(presented, proxyKey)) return ok(undefined)
  return err({ kind: "unauthorized" })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add loopback request auth [proxy-02]`.

---

### Task proxy-03: Anthropic inbound parser

**Files:** Create `packages/proxy/src/adapters/anthropic-request.ts`; Test `anthropic-request.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { parseAnthropicRequest } from "./anthropic-request"

describe("parseAnthropicRequest", () => {
  it("maps an Anthropic Messages body to a normalized request", () => {
    const body = { model: "default", max_tokens: 100, stream: true,
      system: "be terse", messages: [{ role: "user", content: "hi" }] }
    expect(parseAnthropicRequest(body)).toEqual({ ok: true, value: {
      model: "default", system: "be terse", maxTokens: 100, stream: true,
      messages: [{ role: "user", content: "hi" }],
    } })
  })
  it("flattens Anthropic content blocks into a single text string", () => {
    const body = { model: "default", max_tokens: 10, messages: [
      { role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }] }
    const r = parseAnthropicRequest(body)
    expect(r.ok && r.value.messages[0]?.content).toBe("ab")
  })
  it("returns bad-request when the body is missing messages", () => {
    expect(parseAnthropicRequest({ model: "x", max_tokens: 1 }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (zod-validate the wire shape, then normalize; `stream` defaults to false if absent)

```typescript
import { z } from "zod"
import { type Result, ok, err } from "@launchkit/utils"
import { type NormalizedRequest, type ProxyError } from "../types"

const TextBlock = z.object({ type: z.literal("text"), text: z.string() })
const Content = z.union([z.string(), z.array(TextBlock)])
const AnthropicBody = z.object({
  model: z.string().min(1),
  system: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: Content })).min(1),
})

const flatten = (c: z.infer<typeof Content>): string =>
  typeof c === "string" ? c : c.map((b) => b.text).join("")

export const parseAnthropicRequest = (body: unknown): Result<NormalizedRequest, ProxyError> => {
  const parsed = AnthropicBody.safeParse(body)
  if (!parsed.success) return err({ kind: "bad-request", detail: parsed.error.message })
  const b = parsed.data
  return ok({
    model: b.model,
    ...(b.system !== undefined ? { system: b.system } : {}),
    ...(b.max_tokens !== undefined ? { maxTokens: b.max_tokens } : {}),
    ...(b.temperature !== undefined ? { temperature: b.temperature } : {}),
    stream: b.stream ?? false,
    messages: b.messages.map((m) => ({ role: m.role, content: flatten(m.content) })),
  })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add anthropic inbound parser [proxy-03]`.

---

### Task proxy-04: OpenAI inbound parser

**Files:** Create `packages/proxy/src/adapters/openai-request.ts`; Test `openai-request.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { parseOpenAIRequest } from "./openai-request"

describe("parseOpenAIRequest", () => {
  it("maps an OpenAI chat-completions body to a normalized request, lifting the system message", () => {
    const body = { model: "fast", stream: true, messages: [
      { role: "system", content: "be terse" }, { role: "user", content: "hi" }] }
    expect(parseOpenAIRequest(body)).toEqual({ ok: true, value: {
      model: "fast", system: "be terse", stream: true,
      messages: [{ role: "user", content: "hi" }],
    } })
  })
  it("returns bad-request when messages is not an array", () => {
    expect(parseOpenAIRequest({ model: "x", messages: "nope" }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (collapse leading system messages into `system`; keep user/assistant turns)

```typescript
import { z } from "zod"
import { type Result, ok, err } from "@launchkit/utils"
import { type NormalizedRequest, type NormalizedMessage, type ProxyError } from "../types"

const OpenAIBody = z.object({
  model: z.string().min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  })).min(1),
})

export const parseOpenAIRequest = (body: unknown): Result<NormalizedRequest, ProxyError> => {
  const parsed = OpenAIBody.safeParse(body)
  if (!parsed.success) return err({ kind: "bad-request", detail: parsed.error.message })
  const b = parsed.data
  const system = b.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined
  const messages: NormalizedMessage[] = b.messages
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }))
  if (messages.length === 0) return err({ kind: "bad-request", detail: "no user/assistant messages" })
  return ok({
    model: b.model,
    ...(system !== undefined ? { system } : {}),
    ...(b.max_tokens !== undefined ? { maxTokens: b.max_tokens } : {}),
    ...(b.temperature !== undefined ? { temperature: b.temperature } : {}),
    stream: b.stream ?? false,
    messages,
  })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add openai inbound parser [proxy-04]`.

---

### Task proxy-05: Anthropic SSE serializer

**Files:** Create `packages/proxy/src/adapters/anthropic-stream.ts`; Test `anthropic-stream.test.ts`.

> Helper to drain a stream in tests (define once in `packages/proxy/src/test-helpers.ts`):
> ```typescript
> export const collectStream = async (s: ReadableStream<Uint8Array>): Promise<string> => {
>   const reader = s.getReader(); const dec = new TextDecoder(); let out = ""
>   for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value) }
>   return out
> }
> async function* fromArray<T>(xs: readonly T[]): AsyncIterable<T> { for (const x of xs) yield x }
> export { fromArray }
> ```

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { serializeAnthropicStream } from "./anthropic-stream"
import { collectStream, fromArray } from "../test-helpers"
import type { StreamEvent } from "../types"

describe("serializeAnthropicStream", () => {
  it("emits message_start, content deltas, and message_stop for a text stream", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "Hel" }, { type: "text-delta", text: "lo" },
      { type: "finish", finishReason: "stop" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain("event: message_start")
    expect(out).toContain("content_block_delta")
    expect(out).toContain("\"text\":\"Hel\"")
    expect(out).toContain("event: message_stop")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (Anthropic Messages SSE framing; confirm exact event names against Anthropic's streaming spec)

```typescript
import type { StreamEvent } from "../types"

const sse = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

export const serializeAnthropicStream = (events: AsyncIterable<StreamEvent>): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(sse("message_start", { type: "message_start", message: { role: "assistant" } })))
      controller.enqueue(enc.encode(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })))
      for await (const e of events) {
        if (e.type === "text-delta") {
          controller.enqueue(enc.encode(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: e.text } })))
        } else if (e.type === "finish") {
          controller.enqueue(enc.encode(sse("content_block_stop", { type: "content_block_stop", index: 0 })))
          controller.enqueue(enc.encode(sse("message_delta", { type: "message_delta", delta: { stop_reason: e.finishReason } })))
          controller.enqueue(enc.encode(sse("message_stop", { type: "message_stop" })))
        } else {
          controller.enqueue(enc.encode(sse("error", { type: "error", error: { message: e.detail } })))
        }
      }
      controller.close()
    },
  })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add anthropic SSE serializer [proxy-05]`.

---

### Task proxy-06: OpenAI SSE serializer

**Files:** Create `packages/proxy/src/adapters/openai-stream.ts`; Test `openai-stream.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { serializeOpenAIStream } from "./openai-stream"
import { collectStream, fromArray } from "../test-helpers"
import type { StreamEvent } from "../types"

describe("serializeOpenAIStream", () => {
  it("emits chat.completion.chunk data lines and a terminal [DONE]", async () => {
    const events: StreamEvent[] = [{ type: "text-delta", text: "Hi" }, { type: "finish", finishReason: "stop" }]
    const out = await collectStream(serializeOpenAIStream(fromArray(events), "fast"))
    expect(out).toContain("\"object\":\"chat.completion.chunk\"")
    expect(out).toContain("\"content\":\"Hi\"")
    expect(out).toContain("data: [DONE]")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import type { StreamEvent } from "../types"

export const serializeOpenAIStream = (events: AsyncIterable<StreamEvent>, model: string): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  const id = `chatcmpl-${crypto.randomUUID()}`
  const chunk = (delta: Record<string, unknown>, finishReason: string | null): string =>
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(chunk({ role: "assistant" }, null)))
      for await (const e of events) {
        if (e.type === "text-delta") controller.enqueue(enc.encode(chunk({ content: e.text }, null)))
        else if (e.type === "finish") controller.enqueue(enc.encode(chunk({}, e.finishReason)))
        else controller.enqueue(enc.encode(chunk({ content: `[error: ${e.detail}]` }, "stop")))
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add openai SSE serializer [proxy-06]`.

---

### Task proxy-07: Alias router

**Files:** Create `packages/proxy/src/router.ts`; Test `router.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createRouter } from "./router"
import type { Config } from "@launchkit/config"

const config = {
  version: 2, settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  providers: [{ id: "p1", name: "OpenAI", sdkProvider: "openai", config: {}, secrets: {}, models: ["gpt-4o"] }],
  aliases: [{ alias: "fast", providerId: "p1", providerModel: "gpt-4o-mini" }],
} as unknown as Config

describe("createRouter", () => {
  it("resolves an alias to its provider and provider model", () => {
    const r = createRouter(config).resolve("fast")
    expect(r.ok && r.value.providerModel).toBe("gpt-4o-mini")
    expect(r.ok && r.value.provider.id).toBe("p1")
  })
  it("returns unknown-alias when the alias is not in the table", () => {
    expect(createRouter(config).resolve("nope")).toEqual({ ok: false, error: { kind: "unknown-alias", alias: "nope" } })
  })
  it("returns unknown-provider when an alias points at a missing provider", () => {
    const bad = { ...config, aliases: [{ alias: "x", providerId: "ghost", providerModel: "m" }] } as unknown as Config
    expect(createRouter(bad).resolve("x")).toEqual({ ok: false, error: { kind: "unknown-provider", providerId: "ghost" } })
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (build in-memory maps once — performance)

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { Config } from "@launchkit/config"
import type { Provider } from "@launchkit/types"
import type { ProxyError } from "./types"

export interface Router { resolve(alias: string): Result<{ provider: Provider; providerModel: string }, ProxyError> }

export const createRouter = (config: Config): Router => {
  const providers = new Map(config.providers.map((p) => [p.id as string, p]))
  const aliases = new Map(config.aliases.map((a) => [a.alias as string, a]))
  return {
    resolve: (alias) => {
      const a = aliases.get(alias)
      if (a === undefined) return err({ kind: "unknown-alias", alias })
      const provider = providers.get(a.providerId as string)
      if (provider === undefined) return err({ kind: "unknown-provider", providerId: a.providerId as string })
      return ok({ provider, providerModel: a.providerModel })
    },
  }
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add alias router [proxy-07]`.

---

### Task proxy-08: Provider factory (secrets + lazy SDK + cache)

**Files:** Create `packages/proxy/src/providers/factory.ts`; Test `factory.test.ts`.

> `ModelHandle` is the AI SDK `LanguageModel` — opaque to our code (`type ModelHandle = unknown`). The factory's job is purely: resolve secrets → load the SDK module → call its `create*` → return the model, with caching. The `loadSdk` seam is injected so tests never import a real `@ai-sdk/*` package.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, mock } from "bun:test"
import { createProviderFactory } from "./factory"
import { createSecretStore, createInMemoryKeychainBackend } from "@launchkit/secrets"
import { createSequentialIdGen } from "@launchkit/utils"
import type { Provider } from "@launchkit/types"

const makeProvider = (over: Partial<Provider> = {}): Provider => ({
  id: "p1", name: "OpenAI", sdkProvider: "openai", config: {}, secrets: {}, models: [],
  ...over,
} as Provider)

describe("createProviderFactory", () => {
  it("calls the SDK create fn with the resolved api key and returns a model handle", async () => {
    const store = createSecretStore({ backend: createInMemoryKeychainBackend(), idGen: createSequentialIdGen() })
    const set = await store.set("sk-live")
    const ref = set.ok ? set.value : { ref: "x" }
    const create = mock((cfg: { apiKey: string }) => ({ provider: "openai", apiKey: cfg.apiKey }))
    const loadSdk = mock(async (_p: string) => ({ create }))
    const factory = createProviderFactory({ secretStore: store, loadSdk })
    const r = await factory.getModel(makeProvider({ secrets: { apiKey: ref } }), "gpt-4o")
    expect(r.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0]?.[0] as { apiKey: string }).apiKey).toBe("sk-live")
  })
  it("reuses a cached SDK instance when the same provider config is requested twice", async () => {
    const create = mock(() => ({ ok: true }))
    const loadSdk = mock(async () => ({ create }))
    const store = createSecretStore({ backend: createInMemoryKeychainBackend(), idGen: createSequentialIdGen() })
    const factory = createProviderFactory({ secretStore: store, loadSdk })
    const p = makeProvider()
    await factory.getModel(p, "m"); await factory.getModel(p, "m")
    expect(loadSdk).toHaveBeenCalledTimes(1)   // loaded + created once, then cached
  })
  it("returns unsupported-provider when loadSdk has no entry for the sdkProvider", async () => {
    const factory = createProviderFactory({
      secretStore: createSecretStore({ backend: createInMemoryKeychainBackend(), idGen: createSequentialIdGen() }),
      loadSdk: async () => { throw new Error("no module") },
    })
    const r = await factory.getModel(makeProvider({ sdkProvider: "cohere" }), "m")
    expect(r.ok === false && r.error.kind).toBe("unsupported-provider")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (resolve all secret refs to values, build the SDK config, cache the created instance by a stable hash of `(sdkProvider, config, secret refs)`)

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { Provider } from "@launchkit/types"
import type { SecretStore } from "@launchkit/secrets"
import type { ProxyError } from "../types"

export type ModelHandle = unknown

/** An SDK module exposes a `create(config)` returning something we can ask for a model. */
export interface SdkModule { create(config: Record<string, unknown>): unknown }
export type LoadSdk = (sdkProvider: string) => Promise<SdkModule>

export interface ProviderFactory {
  getModel(provider: Provider, providerModel: string): Promise<Result<ModelHandle, ProxyError>>
}

export const createProviderFactory = (deps: { secretStore: SecretStore; loadSdk: LoadSdk }): ProviderFactory => {
  const instanceCache = new Map<string, unknown>()

  const resolveSecrets = async (provider: Provider): Promise<Result<Record<string, string>, ProxyError>> => {
    const out: Record<string, string> = {}
    for (const [field, ref] of Object.entries(provider.secrets)) {
      const got = await deps.secretStore.get(ref)
      if (!got.ok) return err({ kind: "provider-failed", detail: `secret ${field} unavailable` })
      out[field] = got.value
    }
    return ok(out)
  }

  return {
    getModel: async (provider, providerModel) => {
      const secrets = await resolveSecrets(provider)
      if (!secrets.ok) return secrets
      const cacheKey = JSON.stringify({ s: provider.sdkProvider, c: provider.config, r: provider.secrets })
      let instance = instanceCache.get(cacheKey)
      if (instance === undefined) {
        let mod: SdkModule
        try { mod = await deps.loadSdk(provider.sdkProvider) }
        catch { return err({ kind: "unsupported-provider", sdkProvider: provider.sdkProvider }) }
        instance = mod.create({ ...provider.config, ...secrets.value })
        instanceCache.set(cacheKey, instance)
      }
      // The AI SDK convention is `instance(modelId)` or `instance.languageModel(modelId)`;
      // confirm against the installed `ai` version in proxy-12 and adapt this one line.
      const inst = instance as (id: string) => unknown
      return ok(typeof inst === "function" ? inst(providerModel) : instance)
    },
  }
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add provider factory with secret resolution + caching [proxy-08]`.

---

### Task proxy-09: LanguageModelGateway interface + fake

**Files:** Create `packages/proxy/src/gateway.ts`; Test `gateway.test.ts`.

> This task defines the seam + a fake. The REAL implementation (wrapping `streamText`) is built and exercised in `proxy-12`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createScriptedGateway } from "./gateway"
import { collectStream } from "./test-helpers"
import type { StreamEvent } from "./types"

describe("createScriptedGateway", () => {
  it("yields the scripted events when stream() is called", async () => {
    const scripted: StreamEvent[] = [{ type: "text-delta", text: "x" }, { type: "finish", finishReason: "stop" }]
    const gw = createScriptedGateway(scripted)
    const got: StreamEvent[] = []
    for await (const e of gw.stream({}, { model: "m", messages: [{ role: "user", content: "hi" }], stream: true })) got.push(e)
    expect(got).toEqual(scripted)
    void collectStream  // (helper available for serializer tests)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import type { ModelHandle } from "./providers/factory"
import type { NormalizedRequest, StreamEvent } from "./types"

export interface LanguageModelGateway {
  stream(model: ModelHandle, req: NormalizedRequest): AsyncIterable<StreamEvent>
}

export const createScriptedGateway = (events: readonly StreamEvent[]): LanguageModelGateway => ({
  async *stream() { for (const e of events) yield e },
})
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add LanguageModelGateway seam + scripted fake [proxy-09]`.

---

### Task proxy-10: Request handler (wiring, no real network)

**Files:** Create `packages/proxy/src/handler.ts`; Test `handler.test.ts`.

- [ ] **Step 1: Failing test** (drives the whole path with fakes)

```typescript
import { describe, it, expect } from "bun:test"
import { createHandler } from "./handler"
import { createScriptedGateway } from "./gateway"
import { createRouter } from "./router"
import { collectStream } from "./test-helpers"
import type { Config } from "@launchkit/config"

const config = { version: 2, settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  providers: [{ id: "p1", name: "x", sdkProvider: "openai", config: {}, secrets: {}, models: [] }],
  aliases: [{ alias: "default", providerId: "p1", providerModel: "gpt-4o" }] } as unknown as Config

const deps = (key: string) => ({
  proxyKey: key,
  router: createRouter(config),
  factory: { getModel: async () => ({ ok: true as const, value: {} }) },
  gateway: createScriptedGateway([{ type: "text-delta", text: "Hi" }, { type: "finish", finishReason: "stop" }]),
  listAliases: () => config.aliases.map((a) => a.alias as string),
})

const handler = (key = "k") => createHandler(deps(key))
const post = (path: string, body: unknown, headers: Record<string, string> = { "x-api-key": "k" }) =>
  new Request(`http://localhost:4000${path}`, { method: "POST", headers, body: JSON.stringify(body) })

describe("createHandler", () => {
  it("returns 200 for GET /health regardless of auth", async () => {
    const res = await handler().fetch(new Request("http://localhost:4000/health"))
    expect(res.status).toBe(200)
  })
  it("returns 401 when a /v1/messages request has no proxy key", async () => {
    const res = await handler().fetch(post("/v1/messages", { model: "default", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }, {}))
    expect(res.status).toBe(401)
  })
  it("streams Anthropic SSE when a valid /v1/messages request is made", async () => {
    const res = await handler().fetch(post("/v1/messages", { model: "default", max_tokens: 1, stream: true, messages: [{ role: "user", content: "hi" }] }))
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const body = await collectStream(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain("content_block_delta")
    expect(body).toContain("message_stop")
  })
  it("returns 404-style error when the alias is unknown", async () => {
    const res = await handler().fetch(post("/v1/messages", { model: "ghost", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }))
    expect(res.status).toBe(400)
  })
  it("lists the configured aliases for GET /v1/models", async () => {
    const res = await handler().fetch(new Request("http://localhost:4000/v1/models", { headers: { "x-api-key": "k" } }))
    const json = await res.json() as { data: { id: string }[] }
    expect(json.data.map((m) => m.id)).toContain("default")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (route by path; choose adapter by endpoint; auth-gate `/v1/*`; map `ProxyError` → status; stream straight through)

```typescript
import { isErr } from "@launchkit/utils"
import { checkAuth } from "./auth"
import { parseAnthropicRequest } from "./adapters/anthropic-request"
import { parseOpenAIRequest } from "./adapters/openai-request"
import { serializeAnthropicStream } from "./adapters/anthropic-stream"
import { serializeOpenAIStream } from "./adapters/openai-stream"
import type { Router } from "./router"
import type { ProviderFactory } from "./providers/factory"
import type { LanguageModelGateway } from "./gateway"
import type { NormalizedRequest, ProxyError } from "./types"

export interface HandlerDeps {
  proxyKey: string
  router: Router
  factory: ProviderFactory
  gateway: LanguageModelGateway
  listAliases: () => readonly string[]
}

const statusFor = (e: ProxyError): number =>
  e.kind === "unauthorized" ? 401 : e.kind === "provider-failed" ? 502 : 400
const errorResponse = (e: ProxyError): Response =>
  new Response(JSON.stringify({ error: e }), { status: statusFor(e), headers: { "content-type": "application/json" } })

export const createHandler = (deps: HandlerDeps): { fetch(req: Request): Promise<Response> } => {
  const handleChat = async (
    req: Request,
    parse: (b: unknown) => ReturnType<typeof parseAnthropicRequest>,
    serialize: (events: AsyncIterable<import("./types").StreamEvent>, model: string) => ReadableStream<Uint8Array>,
  ): Promise<Response> => {
    const auth = checkAuth(req.headers, deps.proxyKey)
    if (isErr(auth)) return errorResponse(auth.error)
    let body: unknown
    try { body = await req.json() } catch { return errorResponse({ kind: "bad-request", detail: "invalid JSON" }) }
    const parsed = parse(body)
    if (isErr(parsed)) return errorResponse(parsed.error)
    const route = deps.router.resolve(parsed.value.model)
    if (isErr(route)) return errorResponse(route.error)
    const model = await deps.factory.getModel(route.value.provider, route.value.providerModel)
    if (isErr(model)) return errorResponse(model.error)
    const events = deps.gateway.stream(model.value, parsed.value)
    return new Response(serialize(events, parsed.value.model), {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
    })
  }

  return {
    fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
      if (url.pathname === "/v1/models") {
        if (isErr(checkAuth(req.headers, deps.proxyKey))) return errorResponse({ kind: "unauthorized" })
        const data = deps.listAliases().map((id) => ({ id, object: "model" }))
        return new Response(JSON.stringify({ object: "list", data }), { headers: { "content-type": "application/json" } })
      }
      if (url.pathname === "/v1/messages") return handleChat(req, parseAnthropicRequest, serializeAnthropicStream)
      if (url.pathname === "/v1/chat/completions") return handleChat(req, parseOpenAIRequest, serializeOpenAIStream)
      return new Response("not found", { status: 404 })
    },
  }
}
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add request handler wiring [proxy-10]`.

---

### Task proxy-11: startProxy + isProxyRunning + integration test

**Files:** Create `packages/proxy/src/server.ts`; Test `server.integration.test.ts`.

- [ ] **Step 1: Failing integration test** (real `Bun.serve` on an ephemeral port, fake gateway)

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { startProxy, isProxyRunning } from "./server"
import { createScriptedGateway } from "./gateway"
import { createRouter } from "./router"
import { collectStream } from "./test-helpers"
import type { Config } from "@launchkit/config"

const config = { version: 2, settings: { proxyPort: 0, proxyHost: "127.0.0.1" },
  providers: [{ id: "p1", name: "x", sdkProvider: "openai", config: {}, secrets: {}, models: [] }],
  aliases: [{ alias: "default", providerId: "p1", providerModel: "gpt-4o" }] } as unknown as Config

let stop: (() => void) | undefined
afterEach(() => stop?.())

describe("startProxy", () => {
  it("binds loopback and answers /health when started", async () => {
    const s = startProxy({ host: "127.0.0.1", port: 0, proxyKey: "k", router: createRouter(config),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([{ type: "finish", finishReason: "stop" }]),
      listAliases: () => ["default"] })
    stop = s.stop
    expect(s.hostname).toBe("127.0.0.1")
    expect(await isProxyRunning(`http://127.0.0.1:${s.port}`)).toBe(true)
  })
  it("streams a /v1/messages response over a real socket", async () => {
    const s = startProxy({ host: "127.0.0.1", port: 0, proxyKey: "k", router: createRouter(config),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([{ type: "text-delta", text: "Hi" }, { type: "finish", finishReason: "stop" }]),
      listAliases: () => ["default"] })
    stop = s.stop
    const res = await fetch(`http://127.0.0.1:${s.port}/v1/messages`, { method: "POST",
      headers: { "x-api-key": "k" }, body: JSON.stringify({ model: "default", max_tokens: 1, stream: true, messages: [{ role: "user", content: "hi" }] }) })
    expect(await collectStream(res.body as ReadableStream<Uint8Array>)).toContain("content_block_delta")
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement** (Bun.serve bound to loopback; `isProxyRunning` is a cheap health check)

```typescript
import { createHandler, type HandlerDeps } from "./handler"

export interface StartProxyOptions extends HandlerDeps { host: string; port: number }
export interface RunningProxy { hostname: string; port: number; stop(): void }

export const startProxy = (opts: StartProxyOptions): RunningProxy => {
  const handler = createHandler(opts)
  const server = Bun.serve({ hostname: opts.host, port: opts.port, fetch: handler.fetch })
  return { hostname: server.hostname, port: server.port, stop: () => server.stop(true) }
}

export const isProxyRunning = async (baseUrl: string, timeoutMs = 300): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch { return false }
}
```
> SECURITY: `host` is always `127.0.0.1` in production (from `config.settings.proxyHost`); the integration test asserts the bound hostname is loopback. Never accept `0.0.0.0`.

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(proxy): add loopback server + health check [proxy-11]`.

---

### Task proxy-12: Real SDK loader + real gateway (integration)

**Files:** Create `packages/proxy/src/providers/load-sdk.ts`, `packages/proxy/src/providers/real-gateway.ts`; Test `real-gateway.integration.test.ts`.

> This is the only code that touches the real `ai` / `@ai-sdk/*` API. **Confirm the exact `streamText` signature + `fullStream` part shapes against the installed `ai` version** (use context7 / AI SDK docs) before writing — adapt the mapping below to match.

- [ ] **Step 1: Write `load-sdk.ts`** — the lazy, pinned dynamic-import map (PERFORMANCE: only imports the provider actually requested):

```typescript
import type { LoadSdk, SdkModule } from "./factory"

export const loadSdk: LoadSdk = async (sdkProvider): Promise<SdkModule> => {
  switch (sdkProvider) {
    case "openai":     return { create: (await import("@ai-sdk/openai")).createOpenAI }
    case "anthropic":  return { create: (await import("@ai-sdk/anthropic")).createAnthropic }
    case "google":     return { create: (await import("@ai-sdk/google")).createGoogleGenerativeAI }
    case "vertex":     return { create: (await import("@ai-sdk/google-vertex")).createVertex }
    case "bedrock":    return { create: (await import("@ai-sdk/amazon-bedrock")).createAmazonBedrock }
    case "azure":      return { create: (await import("@ai-sdk/azure")).createAzure }
    case "mistral":    return { create: (await import("@ai-sdk/mistral")).createMistral }
    case "cohere":     return { create: (await import("@ai-sdk/cohere")).createCohere }
    case "groq":       return { create: (await import("@ai-sdk/groq")).createGroq }
    case "xai":        return { create: (await import("@ai-sdk/xai")).createXai }
    case "fireworks":  return { create: (await import("@ai-sdk/fireworks")).createFireworks }
    case "perplexity": return { create: (await import("@ai-sdk/perplexity")).createPerplexity }
    case "cerebras":   return { create: (await import("@ai-sdk/cerebras")).createCerebras }
    case "ollama":     return { create: (await import("ollama-ai-provider")).createOllama }
    default: throw new Error(`unsupported sdkProvider: ${sdkProvider}`)
  }
}
```
> Verify each `create*` export name against the installed package versions; correct any that differ. Add each package to `package.json` pinned.

- [ ] **Step 2: Write the failing integration test** using the AI SDK's mock model (the `ai` package ships a mock under `ai/test` — confirm the import path/class for the installed version):

```typescript
import { describe, it, expect } from "bun:test"
import { createRealGateway } from "./real-gateway"
// import { MockLanguageModelV2, simulateReadableStream } from "ai/test"  // confirm exact names/version
import { collectStream } from "../test-helpers"
import { serializeAnthropicStream } from "../adapters/anthropic-stream"

describe("createRealGateway", () => {
  it("maps streamText text deltas to normalized text-delta and finish events", async () => {
    // Build a MockLanguageModelV2 whose doStream yields two text deltas then finish.
    // const model = new MockLanguageModelV2({ doStream: async () => ({ stream: simulateReadableStream({ chunks: [ ... ] }) }) })
    // const gw = createRealGateway()
    // const out = await collectStream(serializeAnthropicStream(gw.stream(model, req)))
    // expect(out).toContain("content_block_delta")
    expect(true).toBe(true) // replace with the real assertions once the mock is wired
  })
})
```
> This test body is a scaffold to fill in against the confirmed mock API. The acceptance criterion: a `streamText` run over a mock model produces `text-delta`s then a `finish`, and those serialize to valid Anthropic SSE. Do NOT leave the trivial assertion — replace it.

- [ ] **Step 3: Implement `real-gateway.ts`**

```typescript
import { streamText } from "ai"
import type { LanguageModelGateway } from "../gateway"
import type { ModelHandle } from "./factory"
import type { NormalizedRequest, StreamEvent } from "../types"

export const createRealGateway = (): LanguageModelGateway => ({
  async *stream(model: ModelHandle, req: NormalizedRequest): AsyncIterable<StreamEvent> {
    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    })
    try {
      for await (const part of result.fullStream) {
        // Map AI SDK stream parts → StreamEvent. Confirm part.type names for the installed version.
        if (part.type === "text-delta") yield { type: "text-delta", text: (part as { text: string }).text }
        else if (part.type === "finish") yield { type: "finish", finishReason: String((part as { finishReason: unknown }).finishReason) }
        else if (part.type === "error") yield { type: "error", detail: String((part as { error: unknown }).error) }
      }
    } catch (e) {
      yield { type: "error", detail: e instanceof Error ? e.message : "stream failed" }
    }
  },
})
```

- [ ] **Step 4: Run the integration test GREEN** (with the real mock wired). **Step 5: Commit** `feat(proxy): add real SDK loader + streamText gateway [proxy-12]`.

---

### Task proxy-13: Barrel + provider config schemas + CLAUDE.md

**Files:** Create `packages/proxy/src/index.ts`, `packages/proxy/src/providers/config-schemas.ts`, `packages/proxy/CLAUDE.md`; Test `config-schemas.test.ts`, `index.test.ts`.

- [ ] **Step 1: Failing test for per-provider config validation** (SECURITY: validate provider config shape before use)

```typescript
import { describe, it, expect } from "bun:test"
import { validateProviderConfig } from "./providers/config-schemas"

describe("validateProviderConfig", () => {
  it("requires a region for the bedrock provider", () => {
    expect(validateProviderConfig("bedrock", {}).ok).toBe(false)
  })
  it("accepts an openai provider with an empty config (key is a secret ref)", () => {
    expect(validateProviderConfig("openai", {}).ok).toBe(true)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement `config-schemas.ts`** — a `Record<SdkProvider, ZodSchema>` for the non-secret `config` of each provider (e.g. `bedrock` requires `region`; `azure` requires `resourceName`+`deploymentId`; `ollama` allows `baseUrl`; others `{}`), and `validateProviderConfig(sdkProvider, config): Result<void, ProxyError>`. Show the full map.

- [ ] **Step 4: Implement `index.ts`** barrel re-exporting `startProxy`, `isProxyRunning`, `createHandler`, `createRouter`, `createProviderFactory`, `loadSdk`, `createRealGateway`, the adapters, `validateProviderConfig`, and all public types.

- [ ] **Step 5: Create `packages/proxy/CLAUDE.md`** from the `proxy` entry in `build-plan/03-claude-config/package-claude-md.md`.

- [ ] **Step 6: GREEN + full gate. Step 7: Update PROGRESS.md, commit** `feat(proxy): add barrel, provider config schemas, CLAUDE.md [proxy-13]`.

**End state:** `@launchkit/proxy` exposes `startProxy(deps)` / `isProxyRunning(url)` and the full pipeline (parse → route → factory → gateway → serialize). The hot path streams without buffering, caches provider instances, lazy-loads only the configured `@ai-sdk/*` packages, binds loopback only, and key-authenticates every `/v1/*` request. Every seam is unit-tested with fakes; one integration test wires the real AI SDK against a mock model. The desktop app injects `loadSdk` + `createRealGateway` + the `SecretStore` + the loaded `Config`.
