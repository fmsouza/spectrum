import type { ProviderDescriptor } from "@spectrum/providers"

/**
 * Build the AI-SDK `create()` options for a provider from its descriptor + the
 * resolved NON-secret config and secret values.
 *
 * - `serverUrl` (or the descriptor default) → the SDK base-URL option.
 * - config fields with `kind:"headers"` are JSON-parsed and merged into headers.
 * - config fields with `mapsToHeader` set their value as that header.
 * - other scalar config keys pass through as options (e.g. region, deploymentId).
 * - the `apiKey` secret is delivered per `descriptor.sdkMapping.apiKey`
 *   (Authorization header for header-auth providers; otherwise an option).
 * - all other secrets pass through as options (e.g. AWS credentials).
 *
 * This replaces the legacy `{...config, ...secrets}` spread and fixes the
 * `baseUrl`→`baseURL` mismatch by mapping through the descriptor.
 */
export const buildSdkOptions = (
  descriptor: ProviderDescriptor,
  config: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, string>>,
): Record<string, unknown> => {
  const m = descriptor.sdkMapping
  const opts: Record<string, unknown> = {}
  const headers: Record<string, string> = { ...(m.defaultHeaders ?? {}) }

  // 1. base URL
  const baseUrl =
    config.serverUrl !== undefined && config.serverUrl !== ""
      ? config.serverUrl
      : m.defaultBaseUrl
  if (baseUrl !== undefined && baseUrl !== "") opts[m.baseUrlOption] = baseUrl

  // 2. non-secret config
  const headerFieldNames = new Set(
    descriptor.configFields
      .filter((f) => f.mapsToHeader !== undefined)
      .map((f) => f.name),
  )
  for (const [name, value] of Object.entries(config)) {
    if (name === "serverUrl") continue
    if (value === "") continue
    if (name === "headers") {
      try {
        const parsed: unknown = JSON.parse(value)
        if (typeof parsed === "object" && parsed !== null) {
          for (const [hk, hv] of Object.entries(parsed)) {
            if (typeof hv === "string") headers[hk] = hv
          }
        }
      } catch {
        // malformed headers are ignored; validateProviderConfig rejects them at write time
      }
      continue
    }
    if (headerFieldNames.has(name)) {
      const field = descriptor.configFields.find((f) => f.name === name)
      if (field?.mapsToHeader !== undefined) headers[field.mapsToHeader] = value
      continue
    }
    opts[name] = value
  }

  // 3. secrets
  for (const [name, value] of Object.entries(secrets)) {
    if (name === "apiKey" && m.apiKey.kind === "header") {
      headers[m.apiKey.name] = `${m.apiKey.scheme} ${value}`
      continue
    }
    opts[name] = value
  }

  if (Object.keys(headers).length > 0) opts.headers = headers
  return opts
}
