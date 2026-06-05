import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"
import type { NormalizedMessage, NormalizedRequest, ProxyError } from "../types"

// A text block. Anthropic blocks may carry extra keys (e.g. cache_control);
// the non-strict object tolerates and ignores them. Non-text blocks
// (tool_use/tool_result/image) are matched by the catch-all branch below.
const TextBlock = z.object({ type: z.literal("text"), text: z.string() })
const ContentBlock = z.union([TextBlock, z.object({ type: z.string() })])
const Content = z.union([z.string(), z.array(ContentBlock)])

// system: a string, or an array of text blocks (Claude Code sends the latter).
const System = z.union([z.string(), z.array(TextBlock)])

const AnthropicBody = z.object({
  model: z.string().min(1),
  system: System.optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: Content,
      }),
    )
    .min(1),
})

// Concatenate the text of a content value, ignoring non-text blocks.
const flatten = (c: z.infer<typeof Content>): string =>
  typeof c === "string"
    ? c
    : c
        .filter((b): b is z.infer<typeof TextBlock> => b.type === "text")
        .map((b) => b.text)
        .join("")

// Flatten a system value (string or array of text blocks) to a string.
const flattenSystem = (s: z.infer<typeof System>): string =>
  typeof s === "string" ? s : s.map((b) => b.text).join("")

export const parseAnthropicRequest = (
  body: unknown,
): Result<NormalizedRequest, ProxyError> => {
  const parsed = AnthropicBody.safeParse(body)
  if (!parsed.success)
    return err({ kind: "bad-request", detail: parsed.error.message })
  const b = parsed.data

  // Collect system text: top-level system first, then any folded
  // system-role messages, joined with newlines.
  const systemPieces: string[] = [
    ...(b.system !== undefined ? [flattenSystem(b.system)] : []),
    ...b.messages
      .filter((m) => m.role === "system")
      .map((m) => flatten(m.content)),
  ]
  const system = systemPieces.join("\n") || undefined

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
