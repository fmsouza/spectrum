import { ModelRouteSchema, ProviderSchema } from "@spectrum/types"
import { z } from "zod"

/** Bump on any breaking config shape change; add a matching `Migration` (see migrations.ts). */
export const CURRENT_CONFIG_VERSION = 8

/**
 * Per-harness "last used" prefs. `mode` is the normalized permission mode the user last selected
 * for this harness, stored as a plain string (like `modelId`) so this package needs no dependency
 * on `@spectrum/agent-events`; the canonical `PermissionMode` is validated at the IPC boundary
 * and re-checked when read at launch. Phase 2 adds optional `modelId`.
 */
export const HarnessPrefsSchema = z
  .object({
    mode: z.string().optional(),
    modelId: z.string().optional(),
  })
  .strict()
export type HarnessPrefs = z.infer<typeof HarnessPrefsSchema>

/**
 * Process-wide settings. `proxyHost` is the literal loopback address — the proxy
 * binds `127.0.0.1` only (security.md), so any other host is rejected at validation.
 * Per-harness "last used" model id lives in `lastByHarness` (the modal no longer carries a
 * model selector; the composer model selector reads/writes per-harness prefs directly).
 */
export const SettingsSchema = z
  .object({
    proxyPort: z.number().int().min(1).max(65535).default(4000),
    proxyHost: z.literal("127.0.0.1").default("127.0.0.1"),
    lastSelectedFolder: z.string().default(""),
    lastSelectedHarnessId: z.string().default(""),
    /** Project IDs whose session group the user has collapsed in the sidebar. */
    collapsedProjects: z.array(z.string()).default([]),
    /** Per-harness "last used" prefs, keyed by harness id. Defaults to `{}`. */
    lastByHarness: z.record(z.string(), HarnessPrefsSchema).default({}),
  })
  .strict()

export type Settings = z.infer<typeof SettingsSchema>

/** The on-disk config document. `providers`/`models` reuse the locked `@spectrum/types` schemas. */
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
