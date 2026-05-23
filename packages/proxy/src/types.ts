import { z } from "zod"

export const NormalizedMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  })
  .strict()
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>

export const NormalizedRequestSchema = z
  .object({
    model: z.string().min(1),
    system: z.string().optional(),
    messages: z.array(NormalizedMessageSchema).min(1),
    maxTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    stream: z.boolean(),
  })
  .strict()
export type NormalizedRequest = z.infer<typeof NormalizedRequestSchema>

export type StreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | {
      readonly type: "finish"
      readonly finishReason: string
      readonly usage?: {
        readonly inputTokens: number
        readonly outputTokens: number
      }
    }
  | { readonly type: "error"; readonly detail: string }

export type ProxyError =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "bad-request"; readonly detail: string }
  | { readonly kind: "unknown-alias"; readonly alias: string }
  | { readonly kind: "unknown-provider"; readonly providerId: string }
  | { readonly kind: "unsupported-provider"; readonly sdkProvider: string }
  | { readonly kind: "provider-failed"; readonly detail: string }
