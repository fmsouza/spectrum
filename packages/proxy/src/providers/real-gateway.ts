import { jsonSchema, streamText } from "ai"
import type { LanguageModelGateway } from "../gateway"
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
    return { type: "error", detail: String(part.error) }
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

export const createRealGateway = (): LanguageModelGateway => ({
  async *stream(
    model: ModelHandle,
    req: NormalizedRequest,
  ): AsyncIterable<StreamEvent> {
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
