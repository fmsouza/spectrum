import { describe, expect, it } from "bun:test"
import {
  CURRENT_CONFIG_VERSION,
  ConfigSchema,
  SettingsSchema,
  defaultConfig,
} from "./schema"

const validProvider = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secrets: { apiKey: { ref: "kc_openai" } },
  models: ["gpt-4o", "gpt-4o-mini"],
}

describe("SettingsSchema", () => {
  it("defaults proxyPort to 4000 and proxyHost to loopback when given an empty object", () => {
    expect(SettingsSchema.parse({})).toEqual({
      proxyPort: 4000,
      proxyHost: "127.0.0.1",
    })
  })
  it("rejects a non-loopback proxyHost so the proxy can never bind a public interface", () => {
    expect(SettingsSchema.safeParse({ proxyHost: "0.0.0.0" }).success).toBe(
      false,
    )
  })
  it("rejects a non-integer proxyPort", () => {
    expect(SettingsSchema.safeParse({ proxyPort: 40.5 }).success).toBe(false)
  })
})

describe("ConfigSchema", () => {
  it("parses a valid config with one provider, one model, and settings", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [validProvider],
      models: [
        { id: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" },
      ],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.parse(config)).toEqual(config)
  })

  it("rejects a provider whose secret is an inline raw string instead of a SecretRef", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [
        { ...validProvider, secrets: { apiKey: "sk-raw-inline-key" } },
      ],
      models: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.safeParse(config).success).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(
      ConfigSchema.safeParse({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        models: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("defaultConfig", () => {
  it("returns the current version, empty providers/models, and loopback defaults", () => {
    expect(defaultConfig()).toEqual({
      version: CURRENT_CONFIG_VERSION,
      providers: [],
      models: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    })
  })
  it("produces a config that satisfies ConfigSchema", () => {
    expect(ConfigSchema.safeParse(defaultConfig()).success).toBe(true)
  })
  it("uses the bumped CURRENT_CONFIG_VERSION of 5", () => {
    expect(CURRENT_CONFIG_VERSION).toBe(5)
  })
})
