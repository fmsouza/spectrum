import type { StreamEvent } from "../types"

const sse = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Map an AI SDK finish reason to an Anthropic `stop_reason`. A tool call always wins (`tool_use`),
 * since Claude Code keys its agent loop off it; otherwise translate the common reasons and default
 * unknown ones to `end_turn`.
 */
const mapStopReason = (reason: string, toolUsed: boolean): string => {
  if (toolUsed) return "tool_use"
  switch (reason) {
    case "length":
      return "max_tokens"
    case "tool-calls":
    case "tool_calls":
      return "tool_use"
    default:
      return "end_turn"
  }
}

/**
 * Map an upstream HTTP status to a canonical Anthropic streaming error `type`. The harness's Anthropic
 * SDK keys retry/handling off this enum, so a transient failure (429/5xx/overloaded) must carry a
 * retryable type rather than being flattened into an opaque, fatal "malformed response". A failure
 * with no HTTP status (timeout, dropped socket) defaults to `api_error`.
 */
const mapErrorType = (statusCode: number | undefined): string => {
  switch (statusCode) {
    case 400:
      return "invalid_request_error"
    case 401:
      return "authentication_error"
    case 403:
      return "permission_error"
    case 404:
      return "not_found_error"
    case 413:
      return "request_too_large"
    case 429:
      return "rate_limit_error"
    case 529:
      return "overloaded_error"
    default:
      return "api_error"
  }
}

/**
 * Render the provider-agnostic event stream as Anthropic Messages SSE. Text is content block 0
 * (opened eagerly). Each tool call becomes its own `tool_use` block at the next index: we close the
 * open block, then emit content_block_start (tool_use), a single input_json_delta carrying the
 * complete arguments, and content_block_stop. `finish` closes any open block and emits message_delta
 * (with the mapped stop_reason + output token usage when known) then message_stop.
 */
export const serializeAnthropicStream = (
  events: AsyncIterable<StreamEvent>,
  model = "",
): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(enc.encode(sse(event, data)))
      }

      // CONTRACT: the harness's Anthropic SDK stores message_start.message as the
      // running message and writes r.usage.output_tokens (and optionally
      // r.usage.input_tokens) on message_delta WITHOUT null-guarding r.usage.
      // The real Anthropic API always includes usage on message_start, so omitting
      // it leaves r.usage undefined and causes "undefined is not an object
      // (evaluating 'e.input_tokens')" on every proxied harness turn. We emit the
      // canonical message envelope with a valid zero usage here; the final totals
      // are overwritten by message_delta, exactly as the SDK's accumulator expects.
      send("message_start", {
        type: "message_start",
        message: {
          id: `msg_${crypto.randomUUID().replace(/-/g, "")}`,
          model,
          role: "assistant",
          content: [],
          stop_reason: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      })
      send("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })

      let openIndex = 0 // the currently-open content block (text starts at 0)
      let nextIndex = 1 // next index to assign to a tool_use block
      let blockOpen = true
      let toolUsed = false
      // Whether a terminal frame (message_stop on finish, or a canonical error
      // event) has been emitted. The harness's Anthropic SDK cannot finalize a
      // streamed message without one, so we guarantee exactly one terminal is
      // sent — even when the upstream ends abruptly with neither a finish nor an
      // error event (a dropped connection) — to avoid a malformed HTTP 200 body.
      let terminated = false

      const closeOpenBlock = (): void => {
        if (!blockOpen) return
        send("content_block_stop", {
          type: "content_block_stop",
          index: openIndex,
        })
        blockOpen = false
      }

      for await (const e of events) {
        if (e.type === "text-delta") {
          send("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: e.text },
          })
        } else if (e.type === "tool-call") {
          // Anthropic content blocks are sequential: close the open one, then open the tool block.
          closeOpenBlock()
          toolUsed = true
          openIndex = nextIndex++
          blockOpen = true
          send("content_block_start", {
            type: "content_block_start",
            index: openIndex,
            content_block: {
              type: "tool_use",
              id: e.toolCallId,
              name: e.toolName,
              input: {},
            },
          })
          send("content_block_delta", {
            type: "content_block_delta",
            index: openIndex,
            delta: {
              type: "input_json_delta",
              partial_json: JSON.stringify(e.input ?? {}),
            },
          })
          send("content_block_stop", {
            type: "content_block_stop",
            index: openIndex,
          })
          blockOpen = false
        } else if (e.type === "finish") {
          closeOpenBlock()
          send("message_delta", {
            type: "message_delta",
            delta: { stop_reason: mapStopReason(e.finishReason, toolUsed) },
            ...(e.usage !== undefined
              ? { usage: { output_tokens: e.usage.outputTokens } }
              : {}),
          })
          send("message_stop", { type: "message_stop" })
          terminated = true
        } else {
          // A mid-stream provider failure. Close any open block, then emit the
          // canonical Anthropic streaming error frame (carrying a typed, possibly
          // retryable `error.type`). This IS the terminal — matching the real
          // Anthropic API, whose SDK throws on an `error` event — so the harness
          // sees an actionable error instead of a malformed, fatal HTTP 200.
          closeOpenBlock()
          send("error", {
            type: "error",
            error: {
              type: mapErrorType(e.statusCode),
              message: e.detail,
            },
          })
          terminated = true
        }
      }
      // The upstream ended without a finish or error event (e.g. a dropped
      // connection). Still terminate the message cleanly so the harness can
      // finalize it rather than reporting an empty/malformed response.
      if (!terminated) {
        closeOpenBlock()
        send("message_delta", {
          type: "message_delta",
          delta: { stop_reason: mapStopReason("", toolUsed) },
        })
        send("message_stop", { type: "message_stop" })
      }
      controller.close()
    },
  })
}
