import { ModelRouteSchema, ProviderSchema } from "@launchkit/types"
import { z } from "zod"

/** Bump on any breaking config shape change; add a matching `Migration` (see migrations.ts). */
export const CURRENT_CONFIG_VERSION = 6

/**
 * Process-wide settings. `proxyHost` is the literal loopback address — the proxy
 * binds `127.0.0.1` only (security.md), so any other host is rejected at validation.
 */
export const SettingsSchema = z
  .object({
    proxyPort: z.number().int().min(1).max(65535).default(4000),
    proxyHost: z.literal("127.0.0.1").default("127.0.0.1"),
    lastSelectedFolder: z.string().default(""),
    lastSelectedHarnessId: z.string().default(""),
    lastSelectedModelId: z.string().default(""),
    /** Project IDs whose session group the user has collapsed in the sidebar. */
    collapsedProjects: z.array(z.string()).default([]),
  })
  .strict()

export type Settings = z.infer<typeof SettingsSchema>

/** The on-disk config document. `providers`/`models` reuse the locked `@launchkit/types` schemas. */
export const ConfigSchema = z
  .object({
    version: z.number().int(),
    providers: z.array(ProviderSchema),
    models: z.array(ModelRouteSchema),
    settings: SettingsSchema,
  })
  .strict()

export type Config = z.infer<typeof ConfigSchema>

/** Factory defaults for a brand-new install — current version, nothing configured, loopback proxy. */
export const defaultConfig = (): Config => ({
  version: CURRENT_CONFIG_VERSION,
  providers: [],
  models: [],
  settings: SettingsSchema.parse({}),
})
