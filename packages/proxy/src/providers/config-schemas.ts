import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"
import type { ProxyError } from "../types"

const providerConfigSchemas: Record<string, z.ZodSchema> = {
  openai: z.object({}).strict(),
  anthropic: z.object({}).strict(),
  google: z.object({}).strict(),
  vertex: z.object({}).strict(),
  bedrock: z.object({ region: z.string().min(1) }).strict(),
  azure: z
    .object({
      resourceName: z.string().min(1),
      deploymentId: z.string().min(1),
    })
    .strict(),
  mistral: z.object({}).strict(),
  cohere: z.object({}).strict(),
  groq: z.object({}).strict(),
  xai: z.object({}).strict(),
  fireworks: z.object({}).strict(),
  perplexity: z.object({}).strict(),
  cerebras: z.object({}).strict(),
  ollama: z.object({ baseUrl: z.string().url().optional() }).strict(),
}

export const validateProviderConfig = (
  sdkProvider: string,
  config: unknown,
): Result<void, ProxyError> => {
  const schema = providerConfigSchemas[sdkProvider]
  if (!schema) return err({ kind: "unsupported-provider", sdkProvider })
  const r = schema.safeParse(config)
  if (!r.success) return err({ kind: "bad-request", detail: r.error.message })
  return ok(undefined)
}
