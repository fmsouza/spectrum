import { type Result, ok, err } from "@launchkit/utils"
import { type Config, ConfigSchema, CURRENT_CONFIG_VERSION, SettingsSchema } from "./schema"
import type { ConfigError } from "./errors"

/** A single forward step: take a raw doc at version `from` and return it shaped for version `to`. */
export type Migration = {
  readonly from: number
  readonly to: number
  readonly migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

/**
 * v1 stored each provider's API key inline as `provider.apiKey`. v2 moves secrets to the
 * keychain, so this strips the inline `apiKey` string and initialises `secrets: {}`
 * (the keychain reference is re-established later by `@launchkit/secrets`). It also fills a
 * default `settings` block, which v1 documents did not have.
 */
const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate: (raw) => {
    const providers = Array.isArray(raw.providers) ? raw.providers : []
    const migratedProviders = providers.map((entry) => {
      // Shallow-copy, drop the legacy inline secret, and re-key secrets as an empty ref map.
      const next = { ...asRecord(entry), secrets: {} }
      delete next.apiKey
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

/** Ordered list of forward migrations. Append a new step whenever `CURRENT_CONFIG_VERSION` bumps. */
export const migrations: readonly Migration[] = [v1ToV2]

/**
 * Read `raw.version`, apply ordered migrations up to `CURRENT_CONFIG_VERSION`, then validate
 * with `ConfigSchema`. Returns `migration-failed` for an unknown/future version, a missing
 * migration step, or a validation failure after migrating.
 */
export const runMigrations = (raw: unknown): Result<Config, ConfigError> => {
  const doc = asRecord(raw)
  const version = doc.version

  if (typeof version !== "number" || !Number.isInteger(version)) {
    return err({ kind: "migration-failed", detail: "config is missing a numeric version" })
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
      return err({ kind: "migration-failed", detail: `no migration from version ${at}` })
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
