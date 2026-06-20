import type { StreamEvent } from "../types"

export const serializeOpenAIStream = (
  events: AsyncIterable<StreamEvent>,
  model: string,
): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder()
  const id = `chatcmpl-${crypto.randomUUID()}`
  const chunk = (
    delta: Record<string, unknown>,
    finishReason: string | null,
  ): string =>
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(chunk({ role: "assistant" }, null)))
      let toolIndex = 0
      let toolUsed = false
      for await (const e of events) {
        if (e.type === "text-delta")
          controller.enqueue(enc.encode(chunk({ content: e.text }, null)))
        else if (e.type === "tool-call") {
          // OpenAI streams a tool call as a tool_calls delta; the arguments are sent as a single
          // JSON string (the model already assembled them — no need to chunk the partial JSON).
          toolUsed = true
          controller.enqueue(
            enc.encode(
              chunk(
                {
                  tool_calls: [
                    {
                      index: toolIndex,
                      id: e.toolCallId,
                      type: "function",
                      function: {
                        name: e.toolName,
                        arguments: JSON.stringify(e.input ?? {}),
                      },
                    },
                  ],
                },
                null,
              ),
            ),
          )
          toolIndex += 1
        } else if (e.type === "finish")
          controller.enqueue(
            enc.encode(chunk({}, toolUsed ? "tool_calls" : e.finishReason)),
          )
        else {
          // A provider failure mid-stream. Emit an OpenAI-style error object and
          // stop — do NOT render it as assistant content with finish_reason "stop"
          // (that masquerades a failure as a successful turn).
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ error: { message: e.detail, type: "api_error", ...(e.statusCode !== undefined ? { code: e.statusCode } : {}) } })}\n\n`,
            ),
          )
          controller.close()
          return
        }
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}
