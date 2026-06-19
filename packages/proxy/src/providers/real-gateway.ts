import { jsonSchema, streamText } from "ai"
import type { LanguageModelGateway, TimeoutWindows } from "../gateway"
import type {
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  NormalizedTool,
  StreamEvent,
} from "../types"
import type { ModelHandle } from "./factory"

/** The AI SDK `streamText` input `messages` array element type. */
type ModelMessage = NonNullable<
  Parameters<typeof streamText>[0]["messages"]
>[number]
/** The AI SDK `streamText` input `tools` map type. */
type ToolSet = NonNullable<Parameters<typeof streamText>[0]["tools"]>

/**
 * Pure: describe a (possibly nested) AI SDK error as the most useful human-readable detail plus the
 * upstream HTTP status. An `AI_RetryError` unwraps to its last attempt's error; an `AI_APICallError`
 * prefers the provider's own response body (`{"error":"..."}` or `{"error":{"message":"..."}}`) over
 * the generic status text — e.g. Ollama's "you have reached your session usage limit ..." instead of
 * "Too Many Requests".
 */
export const describeStreamError = (
  err: unknown,
): { readonly detail: string; readonly statusCode?: number } => {
  if (err instanceof Error && err.name === "AI_RetryError") {
    const last = (err as { lastError?: unknown }).lastError
    if (last !== undefined) return describeStreamError(last)
  }
  if (err instanceof Error && err.name === "AI_APICallError") {
    const e = err as Error & {
      readonly statusCode?: number
      readonly responseBody?: string
    }
    return {
      detail: providerBodyMessage(e.responseBody) ?? e.message,
      ...(e.statusCode !== undefined ? { statusCode: e.statusCode } : {}),
    }
  }
  if (err instanceof Error) return { detail: err.message }
  return { detail: String(err) }
}

/** Pure: extract the message from a provider error body — `{"error":"..."}` or `{"error":{"message":"..."}}`. */
const providerBodyMessage = (body: string | undefined): string | undefined => {
  if (body === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) return undefined
    const error = (parsed as { error?: unknown }).error
    if (typeof error === "string") return error
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    )
      return (error as { message: string }).message
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Pure mapping from an AI SDK v6 high-level `fullStream` part to our internal `StreamEvent`.
 * The high-level text-delta part carries its text in `.text` (v4 used `.textDelta`); the high-level
 * `tool-call` part carries the fully-assembled `.input` (the incremental `tool-input-*` parts are
 * skipped). The high-level `finish` part exposes a plain-string `.finishReason` and a `.totalUsage`
 * breakdown ({ inputTokens, outputTokens, totalTokens }). Unknown / incremental part types (e.g.
 * `text-start`/`text-end`/`start`/`finish-step`/`tool-input-delta`/`reasoning-delta`) map to
 * `undefined` and are skipped.
 */
export const mapFullStreamPart = (
  part: { readonly type: string } & Record<string, unknown>,
): StreamEvent | undefined => {
  if (part.type === "text-delta")
    return { type: "text-delta", text: part.text as string }
  if (part.type === "tool-call")
    return {
      type: "tool-call",
      toolCallId: part.toolCallId as string,
      toolName: part.toolName as string,
      input: part.input,
    }
  if (part.type === "finish") {
    const totalUsage = part.totalUsage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      type: "finish",
      finishReason: String(part.finishReason),
      ...(totalUsage !== undefined
        ? {
            usage: {
              inputTokens: Number(totalUsage.inputTokens),
              outputTokens: Number(totalUsage.outputTokens),
            },
          }
        : {}),
    }
  }
  if (part.type === "error")
    return part.error instanceof Error && part.error.name.startsWith("AI_")
      ? { type: "error", ...describeStreamError(part.error) }
      : { type: "error", detail: String(part.error) }
  if (part.type === "abort")
    return {
      type: "error",
      detail: (part as { reason?: string }).reason ?? "LLM request was aborted",
    }
  return undefined
}

/**
 * Pure mapping from a structured `NormalizedContentPart` to an AI SDK message content part.
 * `text` and `tool-call` map 1:1; a `tool-result` carries its string output wrapped as the AI SDK
 * `{ type: "text", value }` tool-output shape.
 */
const toModelContentPart = (
  part: NormalizedContentPart,
): Record<string, unknown> => {
  if (part.type === "text") return { type: "text", text: part.text }
  if (part.type === "tool-call")
    return {
      type: "tool-call",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.input,
    }
  return {
    type: "tool-result",
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    output: { type: "text", value: part.output },
  }
}

/**
 * Pure builder for the AI SDK `streamText` `messages` array. String content passes through (the
 * common text case); structured content maps each part to its AI SDK shape (carrying assistant tool
 * calls and `tool`-role tool results). The role is preserved verbatim, including `"tool"`.
 */
export const toModelMessages = (req: NormalizedRequest): ModelMessage[] =>
  req.messages.map((m: NormalizedMessage) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map(toModelContentPart),
  })) as ModelMessage[]

/**
 * Pure builder for the AI SDK `streamText` `tools` map. The proxy is a RELAY: each tool carries its
 * definition (description + JSON Schema input) but NO `execute`, so the model emits tool calls and
 * stops — the harness runs the tool and feeds results back.
 */
export const toModelTools = (tools: readonly NormalizedTool[]): ToolSet =>
  Object.fromEntries(
    tools.map((t) => [
      t.name,
      {
        ...(t.description !== undefined ? { description: t.description } : {}),
        inputSchema: jsonSchema(t.inputSchema),
      },
    ]),
  ) as ToolSet

const DEFAULT_TIMEOUTS: TimeoutWindows = {
  firstTokenTimeoutMs: 120_000,
  interTokenTimeoutMs: 60_000,
}

export const createRealGateway = (opts?: {
  readonly getTimeouts?: () => TimeoutWindows
}): LanguageModelGateway => ({
  async *stream(
    model: ModelHandle,
    req: NormalizedRequest,
  ): AsyncIterable<StreamEvent> {
    // The AI SDK v6's streamText has an unawaited recordSpan() call in its
    // DefaultStreamTextResult constructor. When the LLM provider rejects (e.g. 429),
    // that promise becomes an unhandled rejection, the internal stitchable stream is
    // never closed/errored, and result.fullStream hangs forever. We work around this
    // by racing EVERY iterator.next() against a per-chunk timeout. Additionally, an
    // unhandledRejection listener captures the actual AI SDK error message so it can
    // be surfaced instead of the generic timeout message.
    const { firstTokenTimeoutMs, interTokenTimeoutMs } =
      opts?.getTimeouts?.() ?? DEFAULT_TIMEOUTS
    // The first real (mapped) event gets the (generous) first-token window;
    // every event after it gets the inter-token idle window. The error
    // fast-path below is unchanged.
    let firstChunkSeen = false

    const controller = new AbortController()

    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: toModelMessages(req),
      ...(req.tools !== undefined && req.tools.length > 0
        ? { tools: toModelTools(req.tools) }
        : {}),
      ...(req.maxTokens !== undefined
        ? { maxOutputTokens: req.maxTokens }
        : {}),
      ...(req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}),
      // The proxy is a RELAY: the harness owns retry policy. The AI SDK's default
      // (2 retries with exponential backoff) compounds with the harness's own
      // retries into minutes of stall on a rate-limited provider.
      maxRetries: 0,
      abortSignal: controller.signal,
    })

    const iterator = result.fullStream[Symbol.asyncIterator]()

    // Capture AI SDK errors from unhandled rejections and short-circuit the
    // pending chunk wait IMMEDIATELY — without this, a captured provider error
    // would only surface when the chunk timer fires.
    let captureError: Error | null = null
    let shortCircuit: ((err: Error) => void) | null = null
    const onUnhandled = (reason: unknown) => {
      if (reason instanceof Error && reason.name.startsWith("AI_")) {
        captureError = reason
        controller.abort()
        shortCircuit?.(reason)
        shortCircuit = null
      }
    }
    process.on("unhandledRejection", onUnhandled)

    try {
      while (true) {
        type Next = Awaited<ReturnType<typeof iterator.next>>

        // A provider error may have been captured between chunks.
        if (captureError !== null) throw captureError

        const timeoutMs = firstChunkSeen
          ? interTokenTimeoutMs
          : firstTokenTimeoutMs

        const next: Next = await new Promise<Next>((resolve, reject) => {
          const id = setTimeout(() => {
            controller.abort()
            shortCircuit = null
            reject(
              captureError !== null
                ? captureError
                : new Error(
                    `LLM provider did not respond within ${timeoutMs}ms; check your provider credentials, rate limits, and network`,
                  ),
            )
          }, timeoutMs)

          shortCircuit = (err) => {
            clearTimeout(id)
            reject(err)
          }

          void iterator.next().then(
            (val) => {
              clearTimeout(id)
              shortCircuit = null
              resolve(val)
            },
            (err) => {
              clearTimeout(id)
              shortCircuit = null
              reject(err)
            },
          )
        })

        if (next.done) break

        const event = mapFullStreamPart(
          next.value as { type: string } & Record<string, unknown>,
        )
        if (event !== undefined) {
          // The AI SDK's fullStream emits synthetic framing parts (start /
          // start-step / text-start) that map to `undefined` BEFORE the
          // provider's first real token. The first-token window must cover the
          // wait for that first real event; only after we surface a meaningful
          // event do we narrow to the inter-token idle window.
          firstChunkSeen = true
          yield event
        }
      }
    } catch (e: unknown) {
      yield { type: "error", ...describeStreamError(captureError ?? e) }
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  },
})
