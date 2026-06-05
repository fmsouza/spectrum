import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"
import type { NormalizedMessage, NormalizedRequest, ProxyError } from "../types"

// content may be a string or an array of blocks; extract text from text
// blocks and ignore the rest (mirrors the Anthropic inbound adapter).
const TextBlock = z.object({ type: z.literal("text"), text: z.string() })
const ContentBlock = z.union([TextBlock, z.object({ type: z.string() })])
const Content = z.union([z.string(), z.array(ContentBlock)])

const flatten = (c: z.infer<typeof Content>): string =>
  typeof c === "string"
    ? c
    : c
        .filter((b): b is z.infer<typeof TextBlock> => b.type === "text")
        .map((b) => b.text)
        .join("")

const OpenAIBody = z.object({
  model: z.string().min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: Content,
      }),
    )
    .min(1),
})

export const parseOpenAIRequest = (
  body: unknown,
): Result<NormalizedRequest, ProxyError> => {
  const parsed = OpenAIBody.safeParse(body)
  if (!parsed.success)
    return err({ kind: "bad-request", detail: parsed.error.message })
  const b = parsed.data
  const system =
    b.messages
      .filter((m) => m.role === "system")
      .map((m) => flatten(m.content))
      .join("\n") || undefined
  const messages: NormalizedMessage[] = b.messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: typeof m.content } =>
        m.role !== "system",
    )
    .map((m) => ({ role: m.role, content: flatten(m.content) }))
  if (messages.length === 0)
    return err({ kind: "bad-request", detail: "no user/assistant messages" })
  return ok({
    model: b.model,
    ...(system !== undefined ? { system } : {}),
    ...(b.max_tokens !== undefined ? { maxTokens: b.max_tokens } : {}),
    ...(b.temperature !== undefined ? { temperature: b.temperature } : {}),
    stream: b.stream ?? false,
    messages,
  })
}
