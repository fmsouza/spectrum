import { describe, expect, it } from "bun:test"
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
  it("ships ordered v1->v2 and v2->v3 migrations", () => {
    expect(migrations).toHaveLength(2)
    expect(migrations[0]?.from).toBe(1)
    expect(migrations[0]?.to).toBe(2)
    expect(migrations[1]?.from).toBe(2)
    expect(migrations[1]?.to).toBe(3)
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
      profiles: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
    }
    expect(runMigrations(current)).toEqual({ ok: true, value: current })
  })

  it("migrates a v2 config to v3 by seeding an empty profiles array when none exists", () => {
    const v2Config = {
      version: 2,
      providers: [],
      aliases: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
    }
    const result = runMigrations(v2Config)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect(result.value.profiles).toEqual([])
  })

  it("preserves an existing profiles array when migrating v2 to v3", () => {
    const v2WithProfiles = {
      version: 2,
      providers: [],
      aliases: [],
      profiles: [
        {
          id: "pr_default",
          name: "Default",
          harnessId: "claude",
          alias: "fast",
          env: {},
        },
      ],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
    }
    const result = runMigrations(v2WithProfiles)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.profiles).toEqual([
      {
        id: "pr_default",
        name: "Default",
        harnessId: "claude",
        alias: "fast",
        env: {},
      },
    ])
  })

  it("returns migration-failed when version is newer than CURRENT", () => {
    const future = {
      version: CURRENT_CONFIG_VERSION + 1,
      providers: [],
      aliases: [],
      settings: {},
    }
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
      providers: [
        { ...v1Config.providers[0], sdkProvider: "not-a-real-provider" },
      ],
    }
    const result = runMigrations(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })
})
