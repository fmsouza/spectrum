/** The channel a build belongs to, derived from its version string. */
export type AppVersionChannel = "stable" | "canary" | "development"

/** The result of splitting an app version string for display. */
export type ParsedAppVersion = {
  /** The base semver-style version, e.g. "1.6.0". Falls back to the full string when unrecognized. */
  readonly base: string
  /** The channel inferred from the version suffix. "development" is the fallback. */
  readonly channel: AppVersionChannel
  /** The canary build number, e.g. 43 for "1.6.0-canary.43". null for stable/dev. */
  readonly build: number | null
  /** The original version string passed in. */
  readonly full: string
}

const CANARY = /^(\d+\.\d+\.\d+)-canary\.(\d+)$/
const STABLE = /^(\d+\.\d+\.\d+)$/

/**
 * Pure version-string parser for the app version baked into `version.json`.
 * Never throws: an unrecognized string falls back to `{ channel: "development" }`.
 * The `channel` discriminant on `UpdateState` remains the authority for the
 * channel *word*; this parser only splits the version string for display.
 */
export const parseAppVersion = (version: string): ParsedAppVersion => {
  const canary = CANARY.exec(version)
  if (canary !== null) {
    return {
      base: canary[1] as string,
      channel: "canary",
      build: Number(canary[2]),
      full: version,
    }
  }
  const stable = STABLE.exec(version)
  if (stable !== null) {
    return {
      base: stable[1] as string,
      channel: "stable",
      build: null,
      full: version,
    }
  }
  return { base: version, channel: "development", build: null, full: version }
}
