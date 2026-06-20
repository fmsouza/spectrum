/** Inputs to the pure banner-visibility decision. */
export interface BannerPolicyInput {
  readonly available: boolean
  readonly latestVersion: string | null
  /**
   * The build `hash` of the latest available build (unique per build for BOTH
   * stable and canary), or null when up-to-date / unknown. Canary CI never
   * bumps package.json `version`, so `latestVersion` repeats across canary
   * builds while `latestHash` changes on every build — the hash is the
   * per-build identity that dismissal keys on.
   */
  readonly latestHash: string | null
  /** Legacy: the dismissed version string (kept as a fallback for old bundles). */
  readonly dismissedVersion: string | null
  /** The build `hash` the user dismissed; the banner stays hidden for exactly this build. */
  readonly dismissedHash: string | null
}

/**
 * Decide whether the startup update banner should be shown. Pure: the banner
 * appears only when an update is available, has a concrete version, and the
 * build it points at was not the one the user dismissed.
 *
 * Dismissal keys on the build **hash** (unique per build for both channels),
 * not the version string: canary CI never bumps `package.json` version, so a
 * version-keyed dismissal would permanently suppress every canary after the
 * first dismiss. When `latestHash` is null/unknown (an older bundle that didn't
 * surface a hash), it falls back to the legacy version-string comparison so
 * existing users never regress.
 */
export const decideBanner = ({
  available,
  latestVersion,
  latestHash,
  dismissedVersion,
  dismissedHash,
}: BannerPolicyInput): "show" | "hidden" => {
  if (!available || latestVersion === null) return "hidden"
  // Hash-keyed dismissal (per-build): a new build (different hash) re-shows
  // the banner even when the version string is unchanged (the canary case).
  if (latestHash !== null && latestHash === dismissedHash) return "hidden"
  // Legacy fallback: when no hash is available, key on the version string so
  // an older bundle keeps its prior behavior.
  if (latestHash === null && latestVersion === dismissedVersion) return "hidden"
  return "show"
}
