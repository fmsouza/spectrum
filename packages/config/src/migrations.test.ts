import { describe, it, expect } from "bun:test"
import { migrations, runMigrations } from "./migrations"
import { CURRENT_CONFIG_VERSION } from "./schema"

// A realistic v1 document: providers carried their key inline, no `secrets` field, no settings.
const v1Config = {
  version: 1,
  providers: [
    {
      id: "p_openai",
      name: "OpenAI",
      sdkProvider: "openai",
      apiKey: "sk-legacy-inline-key",
      config: { baseUrl: "https://api.openai.com/v1" },
      models: ["gpt-4o"],
    },
  ],
  aliases: [{ alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" }],
}

describe("migrations", () => {
  it("ships exactly one ordered v1->v2 migration", () => {
    expect(migrations).toHaveLength(1)
    expect(migrations[0]?.from).toBe(1)
    expect(migrations[0]?.to).toBe(2)
  })
})

describe("runMigrations", () => {
  it("migrates a v1 config to v2 by moving inline keys to secret refs", () => {
    const result = runMigrations(v1Config)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    const provider = result.value.providers[0]
    expect(provider?.secrets).toEqual({})
    // The inline `apiKey` string is gone — it is not part of the validated Provider shape.
    expect((provider as Record<string, unknown>).apiKey).toBeUndefined()
  })

  it("passes an already-current config through and validates it", () => {
    const current = {
      version: CURRENT_CONFIG_VERSION,
      providers: [],
      aliases: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(runMigrations(current)).toEqual({ ok: true, value: current })
  })

  it("returns migration-failed when version is newer than CURRENT", () => {
    const future = { version: CURRENT_CONFIG_VERSION + 1, providers: [], aliases: [], settings: {} }
    const result = runMigrations(future)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("returns migration-failed when version is missing or not a number", () => {
    const result = runMigrations({ providers: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("validates the result after migrating and fails on a shape error", () => {
    // v1 provider with an invalid sdkProvider survives the migration but must fail ConfigSchema.
    const broken = {
      ...v1Config,
      providers: [{ ...v1Config.providers[0], sdkProvider: "not-a-real-provider" }],
    }
    const result = runMigrations(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })
})
