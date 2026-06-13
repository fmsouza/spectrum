import type { SdkProvider } from "@spectrum/types"
import { type Result, err, ok } from "@spectrum/utils"
import type { ProxyError } from "./types"

// ── HttpGet interface ─────────────────────────────────────────────────────────

/**
 * A minimal injected HTTP GET abstraction: fetches a URL (with optional
 * headers), parses the response as JSON, and returns it as an unknown value.
 * Non-2xx status, network failures, and JSON parse errors map to ProxyError.
 */
export type HttpGet = (
  url: string,
  headers?: Readonly<Record<string, string>>,
) => Promise<Result<unknown, ProxyError>>

/**
 * Real `HttpGet` adapter built on the global `fetch`. Non-2xx responses and
 * JSON parse failures are mapped to `{ kind: "provider-failed", detail }`.
 */
export const createFetchHttpGet = (): HttpGet => async (url, headers) => {
  let res: Response
  try {
    const init: RequestInit = { method: "GET" }
    if (headers !== undefined) init.headers = headers as Record<string, string>
    res = await fetch(url, init)
  } catch (e) {
    return err({
      kind: "provider-failed",
      detail: `network error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  if (!res.ok) {
    return err({
      kind: "provider-failed",
      detail: `HTTP ${res.status} from ${url}`,
    })
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    return err({
      kind: "provider-failed",
      detail: `failed to parse JSON from ${url}: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  return ok(body)
}

// ── Provider classification ───────────────────────────────────────────────────

/** SDK providers that expose the OpenAI-compatible `/v1/models` endpoint. */
const OPENAI_COMPATIBLE_PROVIDERS = new Set<SdkProvider>([
  "openai",
  "groq",
  "xai",
  "fireworks",
  "perplexity",
  "cerebras",
  "mistral",
  "cohere",
])

/**
 * SDK providers that do not expose a public model-listing endpoint that we
 * support. They return an `unsupported-model-discovery` error so the UI can
 * fall back to free-text input.
 */
const UNSUPPORTED_PROVIDERS = new Set<SdkProvider>([
  "anthropic",
  "google",
  "vertex",
  "bedrock",
  "azure",
])

/** Default base URLs per SDK (used when `config.baseUrl` is absent). */
const DEFAULT_BASE_URLS: Partial<Record<SdkProvider, string>> = {
  openai: "https://api.openai.com",
  groq: "https://api.groq.com/openai",
  mistral: "https://api.mistral.ai",
  xai: "https://api.x.ai",
  fireworks: "https://api.fireworks.ai/inference",
  cerebras: "https://api.cerebras.ai",
  perplexity: "https://api.perplexity.ai",
  cohere: "https://api.cohere.ai/compatibility",
}

// ── Response validators ───────────────────────────────────────────────────────

/** Validate and extract ollama /api/tags response → string[]. */
const parseOllamaTags = (
  body: unknown,
): Result<readonly string[], ProxyError> => {
  if (
    typeof body !== "object" ||
    body === null ||
    !("models" in body) ||
    !Array.isArray((body as { models: unknown }).models)
  ) {
    return err({
      kind: "provider-failed",
      detail:
        "unexpected response shape from ollama /api/tags: missing .models array",
    })
  }

  const models = (body as { models: unknown[] }).models
  const names: string[] = []
  for (const item of models) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("name" in item) ||
      typeof (item as { name: unknown }).name !== "string"
    ) {
      return err({
        kind: "provider-failed",
        detail:
          "unexpected item shape in ollama /api/tags .models: missing .name string",
      })
    }
    names.push((item as { name: string }).name)
  }
  return ok(names)
}

/** Validate and extract OpenAI /v1/models response → string[]. */
const parseOpenAIModels = (
  body: unknown,
): Result<readonly string[], ProxyError> => {
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray((body as { data: unknown }).data)
  ) {
    return err({
      kind: "provider-failed",
      detail: "unexpected response shape from /v1/models: missing .data array",
    })
  }

  const data = (body as { data: unknown[] }).data
  const ids: string[] = []
  for (const item of data) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof (item as { id: unknown }).id !== "string"
    ) {
      return err({
        kind: "provider-failed",
        detail: "unexpected item shape in /v1/models .data: missing .id string",
      })
    }
    ids.push((item as { id: string }).id)
  }
  return ok(ids)
}

// ── ModelLister ───────────────────────────────────────────────────────────────

/** Input to the model lister. */
export type ModelListerInput = {
  /** The SDK provider identifier (e.g. "openai", "ollama"). */
  readonly sdkProvider: SdkProvider
  /** Non-secret config including optional `baseUrl`. */
  readonly config: Readonly<Record<string, string>>
  /** Resolved secret API key (absent for keyless providers like ollama). */
  readonly apiKey?: string
}

/**
 * Lists the models available from a configured provider.
 * Returns `Ok<readonly string[]>` on success or `Err<ProxyError>` when the
 * provider is unsupported, unreachable, or returns an unexpected shape.
 */
export type ModelLister = (
  input: ModelListerInput,
) => Promise<Result<readonly string[], ProxyError>>

/**
 * Build a `ModelLister` over an injected `HttpGet`. No network calls in tests:
 * pass a fake `HttpGet` that returns canned bodies.
 *
 * PERFORMANCE: provider instances are NOT cached here (they're cached in the
 * factory); discovery is an on-demand call, not a persistent connection.
 * SECURITY: the apiKey is used only for outbound headers, never returned.
 */
export const createModelLister =
  (deps: { readonly httpGet: HttpGet }): ModelLister =>
  async ({ sdkProvider, config, apiKey }) => {
    // ── Unsupported ────────────────────────────────────────────────────────────
    if (UNSUPPORTED_PROVIDERS.has(sdkProvider)) {
      return err({
        kind: "unsupported-model-discovery",
        sdkProvider,
      })
    }

    // ── Ollama ─────────────────────────────────────────────────────────────────
    if (sdkProvider === "ollama") {
      const base = config.baseUrl ?? "http://localhost:11434"
      const url = `${base}/api/tags`
      const response = await deps.httpGet(url)
      if (!response.ok) return response
      return parseOllamaTags(response.value)
    }

    // ── OpenAI-compatible ──────────────────────────────────────────────────────
    if (OPENAI_COMPATIBLE_PROVIDERS.has(sdkProvider)) {
      const defaultBase = DEFAULT_BASE_URLS[sdkProvider]
      const base = config.baseUrl ?? defaultBase ?? ""
      if (base === "") {
        return err({
          kind: "provider-failed",
          detail: `no base URL configured for provider "${sdkProvider}" and no default is known`,
        })
      }
      const url = `${base}/v1/models`
      const headers: Record<string, string> = {}
      if (apiKey !== undefined && apiKey.length > 0) {
        headers.Authorization = `Bearer ${apiKey}`
      }
      const response = await deps.httpGet(url, headers)
      if (!response.ok) return response
      return parseOpenAIModels(response.value)
    }

    // Should not be reachable given the full SdkProvider union — every value is
    // covered by the branches above. TypeScript cannot narrow Set.has() to never,
    // so this fallback is required for compilation.
    return err({
      kind: "unsupported-model-discovery",
      sdkProvider,
    })
  }
