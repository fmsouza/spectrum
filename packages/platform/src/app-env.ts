/** The app's runtime environment. Production is the safe default when no signal is present. */
export type SpectrumEnv = "development" | "production"

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
