/** Inputs to the pure banner-visibility decision. */
export interface BannerPolicyInput {
  readonly available: boolean
  readonly latestVersion: string | null
  readonly dismissedVersion: string | null
}

/**
 * Decide whether the startup update banner should be shown. Pure: the banner
 * appears only when an update is available, has a concrete version, and that
 * version was not the one the user dismissed. A newer version (different string)
 * re-shows the banner.
 */
export const decideBanner = ({
  available,
  latestVersion,
  dismissedVersion,
}: BannerPolicyInput): "show" | "hidden" => {
  if (!available || latestVersion === null) return "hidden"
  if (latestVersion === dismissedVersion) return "hidden"
  return "show"
}
