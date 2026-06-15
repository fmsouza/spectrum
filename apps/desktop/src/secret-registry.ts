import type { SecretStore } from "@spectrum/secrets"

/** Minimum length a value must have to be registered — guards against over-redaction
 * of short/common substrings (real apiKeys and the ≥32-byte proxy key far exceed this). */
const MIN_SECRET_LENGTH = 8

/**
 * A process-lifetime set of secret strings that have transited this process (the per-run
 * proxy key, resolved apiKeys). Fed at the secret chokepoints; read by the logger's `redact`
 * as defense-in-depth so no record can persist a known secret value. Holds values as plain
 * strings (they are already in memory); this only extends their lifetime for redaction.
 */
export interface SecretRegistry {
  /** Register a secret value. Ignores empty/nullish/too-short values. */
  register(value: string | undefined | null): void
  /** A snapshot of the currently-registered secrets (fresh array each call). */
  snapshot(): readonly string[]
}

export const createSecretRegistry = (): SecretRegistry => {
  const secrets = new Set<string>()
  return {
    register: (value) => {
      if (typeof value === "string" && value.length >= MIN_SECRET_LENGTH)
        secrets.add(value)
    },
    snapshot: () => [...secrets],
  }
}

/**
 * Decorate a SecretStore so every value that transits it is registered for redaction:
 * a successful `get` registers the resolved value; `set` registers the written value.
 * `delete`/`has` pass through unchanged. The store's own behavior/Results are untouched.
 */
export const withSecretRegistration = (
  store: SecretStore,
  registry: SecretRegistry,
): SecretStore => ({
  set: async (value) => {
    registry.register(value)
    return store.set(value)
  },
  get: async (ref) => {
    const result = await store.get(ref)
    if (result.ok) registry.register(result.value)
    return result
  },
  delete: (ref) => store.delete(ref),
  has: (ref) => store.has(ref),
})
