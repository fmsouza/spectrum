import { describe, expect, it } from "bun:test"
import {
  CURRENT_CONFIG_VERSION,
  ConfigSchema,
  SettingsSchema,
  defaultConfig,
} from "./schema"

const validProfile = {
  id: "pr_default",
  name: "Default",
  harnessId: "claude",
  alias: "fast",
  env: {},
}

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
  it("parses a valid config with one provider, one alias, profiles, and settings", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [validProvider],
      aliases: [
        { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" },
      ],
      profiles: [validProfile],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.parse(config)).toEqual(config)
  })

  it("defaults profiles to an empty array shape and rejects a non-array profiles", () => {
    expect(
      ConfigSchema.safeParse({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        profiles: "nope",
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
      }).success,
    ).toBe(false)
  })
  it("rejects a provider whose secret is an inline raw string instead of a SecretRef", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [
        { ...validProvider, secrets: { apiKey: "sk-raw-inline-key" } },
      ],
      aliases: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.safeParse(config).success).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(
      ConfigSchema.safeParse({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("defaultConfig", () => {
  it("returns the current version, empty providers/aliases/profiles, and loopback defaults", () => {
    expect(defaultConfig()).toEqual({
      version: CURRENT_CONFIG_VERSION,
      providers: [],
      aliases: [],
      profiles: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    })
  })
  it("produces a config that satisfies ConfigSchema", () => {
    expect(ConfigSchema.safeParse(defaultConfig()).success).toBe(true)
  })
  it("uses the bumped CURRENT_CONFIG_VERSION of 3", () => {
    expect(CURRENT_CONFIG_VERSION).toBe(3)
  })
})
