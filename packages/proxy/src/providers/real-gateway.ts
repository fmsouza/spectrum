import { streamText } from "ai"
import type { LanguageModelGateway } from "../gateway"
import type { NormalizedRequest, StreamEvent } from "../types"
import type { ModelHandle } from "./factory"

/**
 * Pure mapping from an AI SDK v6 high-level `fullStream` part to our internal `StreamEvent`.
 * The high-level text-delta part carries its text in `.text` (v4 used `.textDelta`); the high-level
 * `finish` part exposes a plain-string `.finishReason` (the v6 provider-level object form is
 * already unwrapped by the time it reaches `fullStream`). Unknown part types (e.g.
 * `text-start`/`text-end`/`start`/`finish-step`) map to `undefined` and are skipped.
 */
export const mapFullStreamPart = (
  part: { readonly type: string } & Record<string, unknown>,
): StreamEvent | undefined => {
  if (part.type === "text-delta")
    return { type: "text-delta", text: part.text as string }
  if (part.type === "finish")
    return { type: "finish", finishReason: String(part.finishReason) }
  if (part.type === "error")
    return { type: "error", detail: String(part.error) }
  return undefined
}

export const createRealGateway = (): LanguageModelGateway => ({
  async *stream(
    model: ModelHandle,
    req: NormalizedRequest,
  ): AsyncIterable<StreamEvent> {
    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as NonNullable<Parameters<typeof streamText>[0]["messages"]>,
      ...(req.maxTokens !== undefined
        ? { maxOutputTokens: req.maxTokens }
        : {}),
      ...(req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}),
    })
    try {
      for await (const part of result.fullStream) {
        const event = mapFullStreamPart(
          part as { type: string } & Record<string, unknown>,
        )
        if (event !== undefined) yield event
      }
    } catch (e) {
      yield {
        type: "error",
        detail: e instanceof Error ? e.message : "stream failed",
      }
    }
  },
})
