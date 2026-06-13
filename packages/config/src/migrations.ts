import { type Result, err, ok } from "@spectrum/utils"
import type { ConfigError } from "./errors"
import {
  CURRENT_CONFIG_VERSION,
  type Config,
  ConfigSchema,
  SettingsSchema,
} from "./schema"

/** A single forward step: take a raw doc at version `from` and return it shaped for version `to`. */
export type Migration = {
  readonly from: number
  readonly to: number
  readonly migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}

/**
 * v1 stored each provider's API key inline as `provider.apiKey`. v2 moves secrets to the
 * keychain, so this strips the inline `apiKey` string and initialises `secrets: {}`
 * (the keychain reference is re-established later by `@spectrum/secrets`). It also fills a
 * default `settings` block, which v1 documents did not have.
 */
const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate: (raw) => {
    const providers = Array.isArray(raw.providers) ? raw.providers : []
    const migratedProviders = providers.map((entry) => {
      // Shallow-copy, drop the legacy inline secret, and re-key secrets as an empty ref map.
      const { apiKey: _unused, ...rest } = asRecord(entry)
      void _unused
      const next: Record<string, unknown> = { ...rest, secrets: {} }
      return next
    })
    return {
      ...raw,
      version: 2,
      providers: migratedProviders,
      settings: SettingsSchema.parse(asRecord(raw.settings)),
    }
  },
}

/**
 * v3 introduces top-level `profiles`. Older documents have no such field, so this seeds
 * `profiles: []` when it is missing or not an array, and otherwise passes the existing
 * array through untouched. Validation against `ConfigSchema` happens after all steps run.
 */
const v2ToV3: Migration = {
  from: 2,
  to: 3,
  migrate: (raw) => ({
    ...raw,
    version: 3,
    profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
  }),
}

/**
 * v4 reframes "aliases" as "models": each alias becomes a ModelRoute whose opaque `id` is the
 * old alias name (already unique within a config, so profile references map without lookups).
 * Profiles' `alias` becomes `modelId`. The harness-level `defaultAlias` is gone entirely; a
 * "default" launch now bypasses the proxy and needs no stored handle.
 */
const v3ToV4: Migration = {
  from: 3,
  to: 4,
  migrate: (raw) => {
    const aliases = Array.isArray(raw.aliases) ? raw.aliases : []
    const models = aliases.map((entry) => {
      const a = asRecord(entry)
      return {
        id: a.alias,
        providerId: a.providerId,
        providerModel: a.providerModel,
      }
    })
    const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(
      (entry) => {
        const { alias, ...rest } = asRecord(entry)
        return alias === undefined ? rest : { ...rest, modelId: alias }
      },
    )
    const { aliases: _drop, ...rest } = raw
    void _drop
    return { ...rest, version: 4, models, profiles }
  },
}

/**
 * v5 removes the `profiles` feature entirely. Older documents may carry a top-level
 * `profiles` array; the strict `ConfigSchema` would now reject it, so this drops the key.
 */
const v4ToV5: Migration = {
  from: 4,
  to: 5,
  migrate: (raw) => {
    const { profiles: _drop, ...rest } = raw
    void _drop
    return { ...rest, version: 5 }
  },
}

/**
 * v6 adds `settings.collapsedProjects` (an array of project IDs that the user has
 * collapsed in the sidebar). The new field has a schema-level default of `[]`, so
 * documents that existed at v5 simply gain the field with an empty array on first
 * load. No data transformation is needed beyond bumping the version.
 */
const v5ToV6: Migration = {
  from: 5,
  to: 6,
  migrate: (raw) => ({ ...raw, version: 6 }),
}

/**
 * v7 adds `settings.lastByHarness` (per-harness "last used" prefs). The new field has a
 * schema-level default of `{}`, so v6 documents simply gain it on first load — no data
 * transformation beyond bumping the version (mirrors v5→v6).
 */
const v6ToV7: Migration = {
  from: 6,
  to: 7,
  migrate: (raw) => ({ ...raw, version: 7 }),
}

/**
 * v8 consolidates model selection: the modal no longer carries a model picker, and the
 * composer's per-harness model selector persists into `lastByHarness[].modelId`. The legacy
 * top-level `settings.lastSelectedModelId` is folded into the per-harness entry attributed by
 * `settings.lastSelectedHarnessId` and then dropped from the shape entirely. Documents that
 * already use `lastByHarness[].modelId` pass through with only the key-removal applied.
 */
const v7ToV8: Migration = {
  from: 7,
  to: 8,
  migrate: (raw) => {
    const settings = asRecord(raw.settings)
    const harnessId =
      typeof settings.lastSelectedHarnessId === "string"
        ? settings.lastSelectedHarnessId
        : ""
    const modelId =
      typeof settings.lastSelectedModelId === "string"
        ? settings.lastSelectedModelId
        : ""
    const lastByHarness = {
      ...(asRecord(settings.lastByHarness) as Record<
        string,
        Record<string, unknown>
      >),
    }
    if (harnessId !== "" && modelId !== "") {
      lastByHarness[harnessId] = {
        ...(lastByHarness[harnessId] ?? {}),
        modelId,
      }
    }
    const { lastSelectedModelId: _drop, ...restSettings } = settings
    void _drop
    return {
      ...raw,
      version: 8,
      settings: { ...restSettings, lastByHarness },
    }
  },
}

/** Ordered list of forward migrations. Append a new step whenever `CURRENT_CONFIG_VERSION` bumps. */
export const migrations: readonly Migration[] = [
  v1ToV2,
  v2ToV3,
  v3ToV4,
  v4ToV5,
  v5ToV6,
  v6ToV7,
  v7ToV8,
]

/**
 * Read `raw.version`, apply ordered migrations up to `CURRENT_CONFIG_VERSION`, then validate
 * with `ConfigSchema`. Returns `migration-failed` for an unknown/future version, a missing
 * migration step, or a validation failure after migrating.
 */
export const runMigrations = (raw: unknown): Result<Config, ConfigError> => {
  const doc = asRecord(raw)
  const version = doc.version

  if (typeof version !== "number" || !Number.isInteger(version)) {
    return err({
      kind: "migration-failed",
      detail: "config is missing a numeric version",
    })
  }
  if (version > CURRENT_CONFIG_VERSION) {
    return err({
      kind: "migration-failed",
      detail: `config version ${version} is newer than supported version ${CURRENT_CONFIG_VERSION}`,
    })
  }

  let current: Record<string, unknown> = doc
  let at = version
  while (at < CURRENT_CONFIG_VERSION) {
    const step = migrations.find((migration) => migration.from === at)
    if (step === undefined) {
      return err({
        kind: "migration-failed",
        detail: `no migration from version ${at}`,
      })
    }
    current = step.migrate(current)
    at = step.to
  }

  const parsed = ConfigSchema.safeParse(current)
  if (!parsed.success) {
    return err({ kind: "migration-failed", detail: parsed.error.message })
  }
  return ok(parsed.data)
}
