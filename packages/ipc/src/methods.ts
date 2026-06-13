import { PermissionModeSchema, StoredEventSchema } from "@spectrum/agent-events"
import {
  HarnessDefinitionSchema,
  HarnessIdSchema,
  ModelIdSchema,
  ModelRouteSchema,
  ProjectIdSchema,
  ProviderIdSchema,
  SdkProviderSchema,
  SessionIdSchema,
  SessionSchema,
} from "@spectrum/types"
import { z } from "zod"
import { ProviderViewSchema } from "./provider-view"

/** `void` over the wire is encoded as `null` (JSON has no `undefined`). */
const VoidSchema = z.null()

// ── Providers ────────────────────────────────────────────────────────────────

export const GetProvidersParamsSchema = z.undefined()
export const GetProvidersResultSchema = z.array(ProviderViewSchema)

/**
 * Add/Update provider inputs carry only NON-secret config + the list of secret
 * field *names* the provider expects. `.strict()` rejects any smuggled `secrets`
 * key — raw values arrive only via `setProviderSecret`.
 */
const ProviderMutationInputSchema = z
  .object({
    name: z.string().optional(),
    sdkProvider: SdkProviderSchema,
    config: z.record(z.string(), z.string()),
    secretFieldNames: z.array(z.string()),
    models: z.array(z.string()),
  })
  .strict()

export const AddProviderParamsSchema = ProviderMutationInputSchema
export const AddProviderResultSchema = ProviderViewSchema

export const UpdateProviderParamsSchema = z
  .object({
    id: ProviderIdSchema,
    input: ProviderMutationInputSchema,
  })
  .strict()
export const UpdateProviderResultSchema = ProviderViewSchema

export const DeleteProviderParamsSchema = z
  .object({ id: ProviderIdSchema })
  .strict()
export const DeleteProviderResultSchema = VoidSchema

export const TestProviderParamsSchema = z
  .object({ id: ProviderIdSchema })
  .strict()
export const TestProviderResultSchema = z
  .object({
    ok: z.boolean(),
    latencyMs: z.number().nonnegative(),
  })
  .strict()

/**
 * The ONLY method whose params carry a raw secret value, and it is inbound
 * (webview→main) only — there is no corresponding main→webview result that
 * echoes it back (returns void).
 */
export const SetProviderSecretParamsSchema = z
  .object({
    providerId: ProviderIdSchema,
    field: z.string().min(1),
    value: z.string().min(1),
  })
  .strict()
export const SetProviderSecretResultSchema = VoidSchema

// ── Models ───────────────────────────────────────────────────────────────────

export const GetModelsParamsSchema = z.undefined()
export const GetModelsResultSchema = z.array(ModelRouteSchema)

/** Add accepts provider + model only; the server mints the opaque id. */
export const AddModelParamsSchema = z
  .object({
    providerId: ProviderIdSchema,
    providerModel: z.string().min(1),
  })
  .strict()
export const AddModelResultSchema = ModelRouteSchema

/** Update keys by id and carries the new provider + model. */
export const UpdateModelParamsSchema = z
  .object({
    id: ModelIdSchema,
    input: ModelRouteSchema.omit({ id: true }),
  })
  .strict()
export const UpdateModelResultSchema = ModelRouteSchema

export const DeleteModelParamsSchema = z.object({ id: ModelIdSchema }).strict()
export const DeleteModelResultSchema = VoidSchema

// ── Harnesses ─────────────────────────────────────────────────────────────────

export const GetHarnessesParamsSchema = z.undefined()

/**
 * Harness-VIEW shape: each builtin harness definition plus a data-driven `native` flag derived from
 * the backend driver registry (`driverRegistry.isNative`). Every launchable harness is native and
 * renders the native RunView — single source of truth = the registry.
 */
export const HarnessViewSchema = HarnessDefinitionSchema.extend({
  native: z.boolean(),
})
export type HarnessView = z.infer<typeof HarnessViewSchema>
export const GetHarnessesResultSchema = z.array(HarnessViewSchema)

export const LaunchHarnessParamsSchema = z
  .object({
    id: HarnessIdSchema,
    modelId: ModelIdSchema.optional(),
    name: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict()
/**
 * Launching opens a native run session via the RunManager (which creates the Session internally),
 * so the GUI only needs the new session's id back — not the full Session.
 */
export const LaunchHarnessResultSchema = z
  .object({ sessionId: SessionIdSchema })
  .strict()

// ── Sessions & proxy ──────────────────────────────────────────────────────────

export const GetSessionsParamsSchema = z
  .object({
    harnessId: HarnessIdSchema.optional(),
    modelId: ModelIdSchema.optional(),
    projectId: ProjectIdSchema.optional(),
    running: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict()
  .optional()
export const GetSessionsResultSchema = z.array(SessionSchema)

export const GetProxyStatusParamsSchema = z.undefined()
export const GetProxyStatusResultSchema = z
  .object({
    running: z.boolean(),
    port: z.number().int().nonnegative(),
  })
  .strict()

// The webview asks for the dedicated runner WebSocket URL (a loopback ws the bun side serves for the
// canonical run-event stream — see apps/desktop/src/gui/runner-socket.ts) and connects to it directly.
export const GetRunnerSocketUrlParamsSchema = z.undefined()
export const GetRunnerSocketUrlResultSchema = z
  .object({ url: z.string() })
  .strict()

// Replay: the full ordered canonical event log for a session, validated by StoredEventSchema.
export const GetRunEventsParamsSchema = z
  .object({ id: SessionIdSchema })
  .strict()
export const GetRunEventsResultSchema = z
  .object({ events: z.array(StoredEventSchema) })
  .strict()

// ── Model discovery ───────────────────────────────────────────────────────

export const ListProviderModelsParamsSchema = z
  .object({ providerId: ProviderIdSchema })
  .strict()
export const ListProviderModelsResultSchema = z
  .object({ models: z.array(z.string()) })
  .strict()

// ── Dialogs ────────────────────────────────────────────────────────────────

// Native folder picker. Params (and the starting hint) are optional; a cancelled
// dialog resolves to `{}` (no `path`), never an error.
export const PickFolderParamsSchema = z
  .object({ startingFolder: z.string().optional() })
  .strict()
  .optional()
export const PickFolderResultSchema = z
  .object({ path: z.string().optional() })
  .strict()

// ── Settings ──────────────────────────────────────────────────────────────

// Read the persisted, non-secret settings the GUI needs to prefill its UI: the
// last launched cwd and harness. The New Session modal seeds its fields from these.
// Per-harness prefs (mode + model) live in `lastByHarness` and are read directly by
// the composer; they are NOT shipped over this endpoint. Empty strings mean "nothing
// remembered yet".
export const GetSettingsParamsSchema = z.undefined()
export const GetSettingsResultSchema = z
  .object({
    lastSelectedFolder: z.string(),
    lastSelectedHarnessId: z.string(),
    collapsedProjects: z.array(z.string()),
  })
  .strict()

// Persist a per-harness "last used" pref. Inbound (webview→main) only; returns void. The mode is
// validated against the canonical PermissionMode here so config never stores an unrecognized value.
// `modelId` is a plain string (not ModelIdSchema) so it accepts "" to mean "default/clear".
export const UpdateHarnessPrefsParamsSchema = z
  .object({
    harnessId: HarnessIdSchema,
    mode: PermissionModeSchema.optional(),
    modelId: z.string().optional(),
  })
  .strict()
export const UpdateHarnessPrefsResultSchema = VoidSchema

// ── Projects ──────────────────────────────────────────────────────────────

export const GetProjectsParamsSchema = z.undefined()
/** Alphabetical (case-insensitive) by name; each carries its total session count. */
export const GetProjectsResultSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      sessionCount: z.number().int().nonnegative(),
    })
    .strict(),
)

export const SetCollapsedProjectsParamsSchema = z
  .object({ ids: z.array(z.string()) })
  .strict()
export const SetCollapsedProjectsResultSchema = VoidSchema

// ── The method → {params, result} schema map ──────────────────────────────────

/** Maps each contract method to its on-the-wire param + result zod schemas. */
export const IpcMethodSchemas = {
  getProviders: {
    params: GetProvidersParamsSchema,
    result: GetProvidersResultSchema,
  },
  addProvider: {
    params: AddProviderParamsSchema,
    result: AddProviderResultSchema,
  },
  updateProvider: {
    params: UpdateProviderParamsSchema,
    result: UpdateProviderResultSchema,
  },
  deleteProvider: {
    params: DeleteProviderParamsSchema,
    result: DeleteProviderResultSchema,
  },
  testProvider: {
    params: TestProviderParamsSchema,
    result: TestProviderResultSchema,
  },
  setProviderSecret: {
    params: SetProviderSecretParamsSchema,
    result: SetProviderSecretResultSchema,
  },
  getModels: {
    params: GetModelsParamsSchema,
    result: GetModelsResultSchema,
  },
  addModel: { params: AddModelParamsSchema, result: AddModelResultSchema },
  updateModel: {
    params: UpdateModelParamsSchema,
    result: UpdateModelResultSchema,
  },
  deleteModel: {
    params: DeleteModelParamsSchema,
    result: DeleteModelResultSchema,
  },
  getHarnesses: {
    params: GetHarnessesParamsSchema,
    result: GetHarnessesResultSchema,
  },
  launchHarness: {
    params: LaunchHarnessParamsSchema,
    result: LaunchHarnessResultSchema,
  },
  getSessions: {
    params: GetSessionsParamsSchema,
    result: GetSessionsResultSchema,
  },
  getProxyStatus: {
    params: GetProxyStatusParamsSchema,
    result: GetProxyStatusResultSchema,
  },
  getRunnerSocketUrl: {
    params: GetRunnerSocketUrlParamsSchema,
    result: GetRunnerSocketUrlResultSchema,
  },
  getRunEvents: {
    params: GetRunEventsParamsSchema,
    result: GetRunEventsResultSchema,
  },
  pickFolder: {
    params: PickFolderParamsSchema,
    result: PickFolderResultSchema,
  },
  listProviderModels: {
    params: ListProviderModelsParamsSchema,
    result: ListProviderModelsResultSchema,
  },
  getSettings: {
    params: GetSettingsParamsSchema,
    result: GetSettingsResultSchema,
  },
  getProjects: {
    params: GetProjectsParamsSchema,
    result: GetProjectsResultSchema,
  },
  setCollapsedProjects: {
    params: SetCollapsedProjectsParamsSchema,
    result: SetCollapsedProjectsResultSchema,
  },
  updateHarnessPrefs: {
    params: UpdateHarnessPrefsParamsSchema,
    result: UpdateHarnessPrefsResultSchema,
  },
} as const

/** The set of valid method names, derived from the schema map. */
export type IpcMethodName = keyof typeof IpcMethodSchemas

/**
 * The typed contract: method name → its params + result TypeScript types,
 * inferred from the schemas above (single source of truth).
 */
export type IpcMethods = {
  readonly [K in IpcMethodName]: {
    readonly params: z.infer<(typeof IpcMethodSchemas)[K]["params"]>
    readonly result: z.infer<(typeof IpcMethodSchemas)[K]["result"]>
  }
}
