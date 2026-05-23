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
      for await (const e of events) {
        if (e.type === "text-delta")
          controller.enqueue(enc.encode(chunk({ content: e.text }, null)))
        else if (e.type === "finish")
          controller.enqueue(enc.encode(chunk({}, e.finishReason)))
        else
          controller.enqueue(
            enc.encode(chunk({ content: `[error: ${e.detail}]` }, "stop")),
          )
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}
