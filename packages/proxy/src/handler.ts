import { type Logger, createNoopLogger } from "@spectrum/logger"
import { isErr } from "@spectrum/utils"
import { parseAnthropicRequest } from "./adapters/anthropic-request"
import { serializeAnthropicStream } from "./adapters/anthropic-stream"
import { parseOpenAIRequest } from "./adapters/openai-request"
import { serializeOpenAIStream } from "./adapters/openai-stream"
import { parseResponsesRequest } from "./adapters/responses-request"
import { serializeResponsesStream } from "./adapters/responses-stream"
import { checkAuth } from "./auth"
import type { LanguageModelGateway } from "./gateway"
import type { ProviderFactory } from "./providers/factory"
import type { Router } from "./router"
import type { ProxyError, StreamEvent } from "./types"

export interface HandlerDeps {
  proxyKey: string
  router: Router
  factory: ProviderFactory
  gateway: LanguageModelGateway
  listModels: () => readonly string[]
  /** Optional observer (default noop). Logs `error` with only `{ kind }` on every error Result. */
  logger?: Logger
}

// A provider rate limit (429) passes through so the harness sees the true
// semantics (and the provider's own quota message). Every other provider
// failure stays 502: leaking e.g. a provider 401 would read as a proxy-auth
// failure to the harness (see the ANTHROPIC_AUTH_TOKEN 401-retry-loop note in
// the claude harness definition).
const statusFor = (e: ProxyError): number =>
  e.kind === "unauthorized"
    ? 401
    : e.kind === "provider-failed"
      ? e.statusCode === 429
        ? 429
        : 502
      : 400
const errorResponse = (e: ProxyError): Response =>
  new Response(JSON.stringify({ error: e }), {
    status: statusFor(e),
    headers: { "content-type": "application/json" },
  })

/**
 * Peek at the first event yielded by the gateway stream. If it is an error
 * event, tear down the generator and return a 502 JSON error response instead
 * of a 200 SSE stream — so the caller (OpenCode serve / harness) sees a proper
 * HTTP error and can emit a `session.error` / `runner-finished:errored` event.
 * If the stream produces normal data, wrap it back into a chained iterable and
 * pass it to the serializer.
 */
const errorOrStream = async (
  events: AsyncIterable<StreamEvent>,
): Promise<
  | { readonly kind: "stream"; readonly events: AsyncIterable<StreamEvent> }
  | {
      readonly kind: "error"
      readonly detail: string
      readonly statusCode?: number
    }
> => {
  const iter = events[Symbol.asyncIterator]()
  let first: IteratorResult<StreamEvent>
  try {
    first = await iter.next()
  } catch (e) {
    await iter.return?.()
    return {
      kind: "error",
      detail: e instanceof Error ? e.message : "stream generation failed",
    }
  }

  if (first.done) {
    await iter.return?.()
    return { kind: "error", detail: "provider returned no data" }
  }

  if (first.value.type === "error") {
    await iter.return?.()
    return {
      kind: "error",
      detail: first.value.detail,
      ...(first.value.statusCode !== undefined
        ? { statusCode: first.value.statusCode }
        : {}),
    }
  }

  // Chain the first value back in front of the remaining iterable
  const chained: AsyncIterable<StreamEvent> = {
    [Symbol.asyncIterator]() {
      let yieldedFirst = false
      return {
        next() {
          if (!yieldedFirst) {
            yieldedFirst = true
            return Promise.resolve({ done: false, value: first.value })
          }
          return iter.next()
        },
        return() {
          return (
            iter.return?.() ?? Promise.resolve({ done: true, value: undefined })
          )
        },
      }
    },
  }

  return { kind: "stream", events: chained }
}

export const createHandler = (
  deps: HandlerDeps,
): { fetch(req: Request): Promise<Response> } => {
  const logger = deps.logger ?? createNoopLogger()
  // Observe every error Result at the response boundary. SECURITY: only the
  // non-sensitive `kind` enum is logged — never the proxyKey, apiKeys, request/
  // response bodies, or the error `detail` (which can echo upstream output).
  // Logging is observation only; the returned `Response` is the sole control-flow signal.
  const fail = (e: ProxyError): Response => {
    logger.error("proxy request failed", { kind: e.kind })
    return errorResponse(e)
  }
  const handleChat = async (
    req: Request,
    parse: (b: unknown) => ReturnType<typeof parseAnthropicRequest>,
    serialize: (
      events: AsyncIterable<StreamEvent>,
      model: string,
    ) => ReadableStream<Uint8Array>,
  ): Promise<Response> => {
    const auth = checkAuth(req.headers, deps.proxyKey)
    if (isErr(auth)) return fail(auth.error)
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return fail({ kind: "bad-request", detail: "invalid JSON" })
    }
    const parsed = parse(body)
    if (isErr(parsed)) return fail(parsed.error)
    const route = deps.router.resolve(parsed.value.model)
    if (isErr(route)) return fail(route.error)
    const model = await deps.factory.getModel(
      route.value.provider,
      route.value.providerModel,
    )
    if (isErr(model)) return fail(model.error)
    const events = deps.gateway.stream(model.value, parsed.value)
    const checked = await errorOrStream(events)
    if (checked.kind === "error")
      return fail({
        kind: "provider-failed",
        detail: checked.detail,
        ...(checked.statusCode !== undefined
          ? { statusCode: checked.statusCode }
          : {}),
      })
    return new Response(serialize(checked.events, parsed.value.model), {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    })
  }

  return {
    fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/health")
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        })
      if (url.pathname === "/v1/models") {
        if (isErr(checkAuth(req.headers, deps.proxyKey)))
          return fail({ kind: "unauthorized" })
        const data = deps.listModels().map((id) => ({ id, object: "model" }))
        return new Response(JSON.stringify({ object: "list", data }), {
          headers: { "content-type": "application/json" },
        })
      }
      if (url.pathname === "/v1/messages")
        return handleChat(req, parseAnthropicRequest, serializeAnthropicStream)
      if (url.pathname === "/v1/chat/completions")
        return handleChat(req, parseOpenAIRequest, serializeOpenAIStream)
      if (url.pathname === "/v1/responses")
        return handleChat(req, parseResponsesRequest, serializeResponsesStream)
      return new Response("not found", { status: 404 })
    },
  }
}
