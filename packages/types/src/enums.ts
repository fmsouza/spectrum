import { z } from "zod"

export const SdkProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "vertex",
  "bedrock",
  "azure",
  "mistral",
  "cohere",
  "groq",
  "xai",
  "fireworks",
  "perplexity",
  "cerebras",
  "ollama",
  "custom",
  "openrouter",
])
export type SdkProvider = z.infer<typeof SdkProviderSchema>

export const ApiFormatSchema = z.enum(["anthropic", "openai"])
export type ApiFormat = z.infer<typeof ApiFormatSchema>
