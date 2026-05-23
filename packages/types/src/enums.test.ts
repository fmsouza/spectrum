import { describe, expect, it } from "bun:test"
import { ApiFormatSchema, SdkProviderSchema } from "./enums"

describe("SdkProviderSchema", () => {
  it("accepts a known provider when given 'anthropic'", () => {
    expect(SdkProviderSchema.parse("anthropic")).toBe("anthropic")
  })
  it("includes every provider from the architecture doc", () => {
    const expected = [
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
    ]
    expect([...SdkProviderSchema.options]).toEqual(expected)
  })
  it("rejects an unknown provider when given 'made-up'", () => {
    expect(SdkProviderSchema.safeParse("made-up").success).toBe(false)
  })
})

describe("ApiFormatSchema", () => {
  it("accepts 'anthropic' and 'openai' and rejects others", () => {
    expect(ApiFormatSchema.safeParse("anthropic").success).toBe(true)
    expect(ApiFormatSchema.safeParse("openai").success).toBe(true)
    expect(ApiFormatSchema.safeParse("grpc").success).toBe(false)
  })
})
