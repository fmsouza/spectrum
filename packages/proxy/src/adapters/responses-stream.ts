import type { StreamEvent } from "../types"

/**
 * Serialize the provider-agnostic event stream as OpenAI **Responses API** SSE (what codex 0.130
 * consumes). Each SSE frame is `event: <type>\ndata: <json>\n\n`, where the json carries the event
 * `type`, a monotonic `sequence_number`, and the event-specific fields.
 *
 * Shape produced (per the Responses streaming protocol):
 *   response.created
 *   [ when there is text ]
 *     response.output_item.added (message)         response.content_part.added (output_text)
 *     response.output_text.delta*                  response.output_text.done
 *     response.content_part.done                   response.output_item.done (message, completed)
 *   [ per tool call ]
 *     response.output_item.added (function_call)   response.function_call_arguments.delta
 *     response.function_call_arguments.done        response.output_item.done (function_call)
 *   response.completed  (response.output = all finalized items, plus usage)
 *
 * The completed event's `output` array is authoritative for codex — it reads the function_call items
 * from there to execute them, so each item is also accumulated as it streams.
 */
type OutputItem =
  | {
      readonly type: "message"
      readonly id: string
      readonly status: "completed"
      readonly role: "assistant"
      readonly content: ReadonlyArray<{
        type: "output_text"
        text: string
        annotations: never[]
      }>
    }
  | {
      readonly type: "function_call"
      readonly id: string
      readonly status: "completed"
      readonly call_id: string
      readonly name: string
      readonly arguments: string
    }

const mapStatus = (finishReason: string, toolUsed: boolean): string =>
  toolUsed || finishReason === "tool-calls" || finishReason === "tool_calls"
    ? "completed"
    : finishReason === "length"
      ? "incomplete"
      : "completed"

export const serializeResponsesStream = (
  events: AsyncIterable<StreamEvent>,
  model: string,
): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  const responseId = `resp_${crypto.randomUUID().replace(/-/g, "")}`
  const createdAt = Math.floor(Date.now() / 1000)

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = 0
      const send = (type: string, fields: Record<string, unknown>): void => {
        const data = JSON.stringify({ type, sequence_number: seq++, ...fields })
        controller.enqueue(enc.encode(`event: ${type}\ndata: ${data}\n\n`))
      }

      const output: OutputItem[] = []
      let nextIndex = 0

      // Lazily-opened assistant message (text) item.
      let msgId: string | undefined
      let msgIndex = 0
      let text = ""

      const responseEnvelope = (
        status: string,
        extra: Record<string, unknown>,
      ) => ({
        id: responseId,
        object: "response",
        created_at: createdAt,
        status,
        model,
        output,
        ...extra,
      })

      const openMessage = (): void => {
        if (msgId !== undefined) return
        msgId = `msg_${crypto.randomUUID().replace(/-/g, "")}`
        msgIndex = nextIndex++
        send("response.output_item.added", {
          output_index: msgIndex,
          item: {
            id: msgId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        })
        send("response.content_part.added", {
          item_id: msgId,
          output_index: msgIndex,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        })
      }

      const closeMessage = (): void => {
        if (msgId === undefined) return
        send("response.output_text.done", {
          item_id: msgId,
          output_index: msgIndex,
          content_index: 0,
          text,
        })
        send("response.content_part.done", {
          item_id: msgId,
          output_index: msgIndex,
          content_index: 0,
          part: { type: "output_text", text, annotations: [] },
        })
        const item: OutputItem = {
          type: "message",
          id: msgId,
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text, annotations: [] }],
        }
        output.push(item)
        send("response.output_item.done", { output_index: msgIndex, item })
        msgId = undefined
        text = ""
      }

      send("response.created", {
        response: responseEnvelope("in_progress", { output: [] }),
      })

      let toolUsed = false
      let finishReason = "stop"
      let usage: { inputTokens: number; outputTokens: number } | undefined

      for await (const e of events) {
        if (e.type === "text-delta") {
          openMessage()
          text += e.text
          send("response.output_text.delta", {
            item_id: msgId,
            output_index: msgIndex,
            content_index: 0,
            delta: e.text,
          })
        } else if (e.type === "tool-call") {
          closeMessage() // content blocks are sequential
          toolUsed = true
          const index = nextIndex++
          const id = `fc_${crypto.randomUUID().replace(/-/g, "")}`
          const args = JSON.stringify(e.input ?? {})
          send("response.output_item.added", {
            output_index: index,
            item: {
              id,
              type: "function_call",
              status: "in_progress",
              call_id: e.toolCallId,
              name: e.toolName,
              arguments: "",
            },
          })
          send("response.function_call_arguments.delta", {
            item_id: id,
            output_index: index,
            delta: args,
          })
          send("response.function_call_arguments.done", {
            item_id: id,
            output_index: index,
            arguments: args,
          })
          const item: OutputItem = {
            type: "function_call",
            id,
            status: "completed",
            call_id: e.toolCallId,
            name: e.toolName,
            arguments: args,
          }
          output.push(item)
          send("response.output_item.done", { output_index: index, item })
        } else if (e.type === "finish") {
          finishReason = e.finishReason
          usage = e.usage
        } else {
          // stream error: surface it as a failed response so codex stops cleanly.
          closeMessage()
          send("response.failed", {
            response: responseEnvelope("failed", {
              error: { code: "provider_error", message: e.detail },
            }),
          })
          controller.close()
          return
        }
      }

      closeMessage()
      const inputTokens = usage?.inputTokens ?? 0
      const outputTokens = usage?.outputTokens ?? 0
      send("response.completed", {
        response: responseEnvelope(mapStatus(finishReason, toolUsed), {
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
          },
        }),
      })
      controller.close()
    },
  })
}
