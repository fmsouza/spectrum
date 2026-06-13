import { type Result, err } from "@spectrum/utils"
import type { ConfigError } from "./errors"
import { runMigrations } from "./migrations"
import type { Config } from "./schema"

/**
 * Serialize a `Config` to portable, human-readable JSON (2-space). PURE. Safe by construction:
 * `Config` models every secret as a `SecretRef` (a `{ ref }`), never a value — so an exported
 * document cannot contain a secret value (asserted in transfer.test.ts). The keychain *reference*
 * travels (it is not itself a secret); the value stays in the OS keychain.
 */
export const exportConfig = (config: Config): string =>
  JSON.stringify(config, null, 2)

/**
 * Validate untrusted import input (a parsed object OR a JSON string) into a `Config`. PURE.
 * Reject-by-default (`security.md`): a JSON string is parsed first (`parse-failed` on syntax error),
 * then the value runs through `runMigrations`, which forward-migrates older versions AND validates
 * with `ConfigSchema` — so a foreign shape, an inline raw secret, a non-loopback host, or a
 * future/unknown version all fail as a typed `ConfigError` (`migration-failed`) rather than being
 * trusted. The same validation path the on-disk loader uses, so import can never admit a config the
 * loader would reject.
 */
export const importConfig = (raw: unknown): Result<Config, ConfigError> => {
  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "parse-failed", detail })
    }
  }
  return runMigrations(value)
}
