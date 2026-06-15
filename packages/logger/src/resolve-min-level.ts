import type { LogLevel } from "./types"

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error", "fatal"]

const isLevel = (v: string | undefined): v is LogLevel =>
  v !== undefined && (LEVELS as readonly string[]).includes(v)

/**
 * Resolve the startup minimum level: an explicit valid SPECTRUM_LOG_LEVEL wins; otherwise
 * `debug` in development, `info` elsewhere.
 */
export const resolveMinLevel = (
  appEnv: "development" | "production",
  env: Readonly<Record<string, string | undefined>>,
): LogLevel => {
  const override = env.SPECTRUM_LOG_LEVEL
  if (isLevel(override)) return override
  return appEnv === "development" ? "debug" : "info"
}
