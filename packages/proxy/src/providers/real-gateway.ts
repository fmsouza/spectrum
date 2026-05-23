import { streamText } from "ai"
import type { LanguageModelGateway } from "../gateway"
import type { NormalizedRequest, StreamEvent } from "../types"
import type { ModelHandle } from "./factory"

export const createRealGateway = (): LanguageModelGateway => ({
  async *stream(
    model: ModelHandle,
    req: NormalizedRequest,
  ): AsyncIterable<StreamEvent> {
    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}),
    })
    try {
      for await (const part of result.fullStream) {
        if (part.type === "text-delta")
          yield {
            type: "text-delta",
            text: (part as { textDelta: string }).textDelta,
          }
        else if (part.type === "finish")
          yield {
            type: "finish",
            finishReason: String(
              (part as { finishReason: unknown }).finishReason,
            ),
          }
        else if (part.type === "error")
          yield {
            type: "error",
            detail: String((part as { error: unknown }).error),
          }
      }
    } catch (e) {
      yield {
        type: "error",
        detail: e instanceof Error ? e.message : "stream failed",
      }
    }
  },
})
