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
 * Render the provider-agnostic event stream as Anthropic Messages SSE. Text is content block 0
 * (opened eagerly). Each tool call becomes its own `tool_use` block at the next index: we close the
 * open block, then emit content_block_start (tool_use), a single input_json_delta carrying the
 * complete arguments, and content_block_stop. `finish` closes any open block and emits message_delta
 * (with the mapped stop_reason + output token usage when known) then message_stop.
 */
export const serializeAnthropicStream = (
  events: AsyncIterable<StreamEvent>,
): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(enc.encode(sse(event, data)))
      }

      send("message_start", {
        type: "message_start",
        message: { role: "assistant" },
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
        } else {
          send("error", { type: "error", error: { message: e.detail } })
        }
      }
      controller.close()
    },
  })
}
