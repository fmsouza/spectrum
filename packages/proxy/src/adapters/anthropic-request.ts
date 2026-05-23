import { z } from "zod"
import { type Result, ok, err } from "@launchkit/utils"
import { type NormalizedRequest, type ProxyError } from "../types"

const TextBlock = z.object({ type: z.literal("text"), text: z.string() })
const Content = z.union([z.string(), z.array(TextBlock)])
const AnthropicBody = z.object({
  model: z.string().min(1),
  system: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: Content })).min(1),
})

const flatten = (c: z.infer<typeof Content>): string =>
  typeof c === "string" ? c : c.map((b) => b.text).join("")

export const parseAnthropicRequest = (body: unknown): Result<NormalizedRequest, ProxyError> => {
  const parsed = AnthropicBody.safeParse(body)
  if (!parsed.success) return err({ kind: "bad-request", detail: parsed.error.message })
  const b = parsed.data
  return ok({
    model: b.model,
    ...(b.system !== undefined ? { system: b.system } : {}),
    ...(b.max_tokens !== undefined ? { maxTokens: b.max_tokens } : {}),
    ...(b.temperature !== undefined ? { temperature: b.temperature } : {}),
    stream: b.stream ?? false,
    messages: b.messages.map((m) => ({ role: m.role, content: flatten(m.content) })),
  })
}
