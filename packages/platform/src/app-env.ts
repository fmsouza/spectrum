/** The app's runtime environment. Production is the safe default when no signal is present. */
export type SpectrumEnv = "development" | "production"

/** The release channel the app binary was built for. */
export type Channel = "stable" | "canary" | "development"

/**
 * Resolve the release channel. The bundled build channel is authoritative:
 * "canary" → canary, "dev" → development, any other value → stable.
 * When no channel is bundled (CLI / bun test), falls back to SPECTRUM_ENV:
 * "development" → development, anything else → stable.
 */
export const resolveChannel = (input: {
  readonly buildChannel: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
}): Channel =>
  input.buildChannel === "canary"
    ? "canary"
    : input.buildChannel === "dev"
      ? "development"
      : input.buildChannel !== undefined
        ? "stable"
        : input.env.SPECTRUM_ENV === "development"
          ? "development"
          : "stable"

/**
 * Derive the app environment from the process env. Pure. Development is strictly opt-in:
 * only the exact string "development" selects it — anything else (unset, "production",
 * "dev", empty) resolves to production so a misconfigured shell never touches prod's
 * keychain or data dir by accident.
 */
export const detectAppEnv = (
  env: Readonly<Record<string, string | undefined>>,
): SpectrumEnv =>
  env.SPECTRUM_ENV === "development" ? "development" : "production"

/**
 * Resolve the app environment for a real run. The bundled build channel (from the
 * app's `version.json`) is authoritative: `"dev"` selects development, anything else
 * (`"stable"`, `"canary"`) selects production. This deliberately wins over an ambient
 * `SPECTRUM_ENV` so an installed app never lands in the dev data dir just because the
 * launching shell exported `SPECTRUM_ENV=development`. When no channel is available
 * (the CLI binary, `bun test`), fall back to `detectAppEnv(env)`.
 */
export const resolveAppEnv = (input: {
  readonly buildChannel: string | undefined
  readonly env: Readonly<Record<string, string | undefined>>
}): SpectrumEnv =>
  input.buildChannel !== undefined
    ? input.buildChannel === "dev"
      ? "development"
      : "production"
    : detectAppEnv(input.env)
