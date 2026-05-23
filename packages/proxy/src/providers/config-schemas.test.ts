import { describe, expect, it } from "bun:test"
import { validateProviderConfig } from "./config-schemas"

describe("validateProviderConfig", () => {
  it("requires a region for the bedrock provider", () => {
    expect(validateProviderConfig("bedrock", {}).ok).toBe(false)
  })
  it("accepts an openai provider with an empty config (key is a secret ref)", () => {
    expect(validateProviderConfig("openai", {}).ok).toBe(true)
  })
})
