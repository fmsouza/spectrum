import { type Logger, createNoopLogger } from "@spectrum/logger"
import { type Result, err, isOk, ok } from "@spectrum/utils"
import type { ConfigError } from "./errors"
import type { ConfigFile } from "./file"
import { runMigrations } from "./migrations"
import { type Config, ConfigSchema, defaultConfig } from "./schema"

/** Read/write the whole config document. The read path returns a fully migrated + validated `Config`. */
export interface ConfigStore {
  load(): Promise<Result<Config, ConfigError>>
  save(config: Config): Promise<Result<void, ConfigError>>
}

const parseJson = (raw: string): Result<unknown, ConfigError> => {
  try {
    return ok(JSON.parse(raw) as unknown)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    return err({ kind: "parse-failed", detail })
  }
}

export const createFileConfigStore = (deps: {
  readonly file: ConfigFile
  readonly logger?: Logger
}): ConfigStore => {
  const { file } = deps
  const logger = deps.logger ?? createNoopLogger()

  /**
   * Observe a load/save failure. Logging is observation only — the `Result` is
   * returned unchanged and remains the sole control-flow signal. SECURITY: only
   * the non-secret error `kind` + `detail` (parse/IO/validation message text) is
   * logged; raw config contents and secret values are never passed as fields.
   */
  const observe = <T>(
    result: Result<T, ConfigError>,
  ): Result<T, ConfigError> => {
    if (!isOk(result) && result.error.kind !== "not-found") {
      logger.error("config op failed", {
        kind: result.error.kind,
        detail: result.error.detail,
      })
    }
    return result
  }

  return {
    load: async (): Promise<Result<Config, ConfigError>> => {
      if (!(await file.exists())) return ok(defaultConfig())

      const read = await file.read()
      if (!isOk(read)) return observe(read)

      const parsed = parseJson(read.value)
      if (!isOk(parsed)) return observe(parsed)

      return observe(runMigrations(parsed.value))
    },
    // `save` is implemented in config-05.
    save: async (config: Config): Promise<Result<void, ConfigError>> => {
      const validated = ConfigSchema.safeParse(config)
      if (!validated.success) {
        return observe(
          err({ kind: "write-failed", detail: validated.error.message }),
        )
      }
      return observe(
        await file.writeAtomic(JSON.stringify(validated.data, null, 2)),
      )
    },
  }
}
