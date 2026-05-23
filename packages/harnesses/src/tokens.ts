/** The only interpolation tokens a harness env template may use. */
export const ALLOWED_TOKENS = ["proxyUrl", "proxyKey", "model"] as const
export type AllowedToken = (typeof ALLOWED_TOKENS)[number]
