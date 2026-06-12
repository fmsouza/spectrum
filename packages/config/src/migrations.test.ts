import { describe, expect, it } from "bun:test"
import { isOk } from "@launchkit/utils"
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
  it("ships ordered v1->v2, v2->v3, v3->v4, v4->v5, v5->v6, and v6->v7 migrations", () => {
    expect(migrations).toHaveLength(6)
    expect(migrations[0]?.from).toBe(1)
    expect(migrations[0]?.to).toBe(2)
    expect(migrations[1]?.from).toBe(2)
    expect(migrations[1]?.to).toBe(3)
    expect(migrations[2]?.from).toBe(3)
    expect(migrations[2]?.to).toBe(4)
    expect(migrations[3]?.from).toBe(4)
    expect(migrations[3]?.to).toBe(5)
    expect(migrations[4]?.from).toBe(5)
    expect(migrations[4]?.to).toBe(6)
    expect(migrations[5]?.from).toBe(6)
    expect(migrations[5]?.to).toBe(7)
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
    expect("profiles" in result.value).toBe(false)
  })

  it("passes an already-current config through and validates it", () => {
    const current = {
      version: CURRENT_CONFIG_VERSION,
      providers: [],
      models: [],
      settings: {
        proxyPort: 4000,
        proxyHost: "127.0.0.1" as const,
        lastSelectedFolder: "",
        lastSelectedHarnessId: "",
        lastSelectedModelId: "",
        collapsedProjects: [],
        lastByHarness: {},
      },
    }
    expect(runMigrations(current)).toEqual({ ok: true, value: current })
  })

  it("migrates a v2 config through the chain and drops profiles by the current version", () => {
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
    expect("profiles" in result.value).toBe(false)
  })

  it("strips a legacy profiles array carried up from v2 by the current version", () => {
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
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect("profiles" in result.value).toBe(false)
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

  it("migrates a v6 config to v7, adding an empty lastByHarness", () => {
    const v6 = {
      version: 6,
      providers: [],
      models: [],
      settings: {
        proxyPort: 4000,
        proxyHost: "127.0.0.1" as const,
        lastSelectedFolder: "",
        lastSelectedHarnessId: "",
        lastSelectedModelId: "",
        collapsedProjects: [],
      },
    }
    const result = runMigrations(v6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect(result.value.settings.lastByHarness).toEqual({})
  })
})

describe("v3 → v4 (aliases → models)", () => {
  it("converts aliases to models keyed by the old alias name and drops profiles by the current version", () => {
    const raw = {
      version: 3,
      providers: [],
      aliases: [
        { alias: "fast", providerId: "openai", providerModel: "gpt-4o-mini" },
      ],
      profiles: [
        { id: "p1", name: "Fast", harnessId: "claude", alias: "fast", env: {} },
      ],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    const result = runMigrations(raw)
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect(result.value.models).toEqual([
      { id: "fast", providerId: "openai", providerModel: "gpt-4o-mini" },
    ])
    expect("profiles" in result.value).toBe(false)
    expect("aliases" in result.value).toBe(false)
  })

  it("yields empty models when there are no aliases", () => {
    const raw = {
      version: 3,
      providers: [],
      aliases: [],
      profiles: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    const result = runMigrations(raw)
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.models).toEqual([])
  })
})

describe("v4 → v5 (drop profiles)", () => {
  it("v4→v5 strips the profiles field so the strict schema accepts the doc", () => {
    const raw = {
      version: 4,
      providers: [],
      models: [],
      profiles: [{ id: "pr_1", name: "Fast", harnessId: "claude", env: {} }],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
      expect("profiles" in result.value).toBe(false)
    }
  })
})
