import { PermissionModeSchema, StoredEventSchema } from "@spectrum/agent-events"
import { ProviderCatalogEntrySchema } from "@spectrum/providers"
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

export const GetProviderCatalogParamsSchema = z.undefined()
export const GetProviderCatalogResultSchema = z.array(
  ProviderCatalogEntrySchema,
)

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

/** Add carries optional inline secret VALUES (inbound-only) for an atomic create. */
export const AddProviderParamsSchema = ProviderMutationInputSchema.extend({
  secrets: z.record(z.string(), z.string()).optional(),
}).strict()
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

// Delete a single session and all its run events (cascade lives in @spectrum/data-admin).
export const DeleteSessionParamsSchema = z
  .object({ sessionId: SessionIdSchema })
  .strict()
export const DeleteSessionResultSchema = VoidSchema

// ── Model discovery ───────────────────────────────────────────────────────

export const ListProviderModelsParamsSchema = z
  .object({ providerId: ProviderIdSchema })
  .strict()
export const ListProviderModelsResultSchema = z
  .object({ models: z.array(z.string()) })
  .strict()

/**
 * Draft (un-saved) probes carry raw secret VALUES inbound-only (like setProviderSecret).
 * Their RESULTS never echo secrets — only {ok,latencyMs} / {models}.
 */
const DraftProbeInputSchema = z
  .object({
    sdkProvider: SdkProviderSchema,
    config: z.record(z.string(), z.string()),
    secrets: z.record(z.string(), z.string()),
  })
  .strict()

export const TestProviderDraftParamsSchema = DraftProbeInputSchema.extend({
  providerModel: z.string(),
}).strict()
export const TestProviderDraftResultSchema = TestProviderResultSchema

export const ListProviderModelsDraftParamsSchema = DraftProbeInputSchema
export const ListProviderModelsDraftResultSchema =
  ListProviderModelsResultSchema

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

// Delete a project and all its sessions + their run events (cascade in @spectrum/data-admin).
export const DeleteProjectParamsSchema = z
  .object({ projectId: ProjectIdSchema })
  .strict()
export const DeleteProjectResultSchema = VoidSchema

// ── Data (factory reset) ────────────────────────────────────────────────────

// Wipe ALL app data (db + config + keychain secrets + runtime) and relaunch to a
// first-launch state. Inbound-only; the handler may relaunch before it returns.
export const ResetAppParamsSchema = z.undefined()
export const ResetAppResultSchema = VoidSchema

// ── Updates ─────────────────────────────────────────────────────────────────

export const ChannelSchema = z.enum(["stable", "canary"])

export const UpdatePhaseSchema = z.enum([
  "idle",
  "checking",
  "up-to-date",
  "available",
  "downloading",
  "downloaded",
  "applying",
  "error",
])

/** Full updater state crossing to the webview. `void` mutations return null. */
export const UpdateStateSchema = z
  .object({
    phase: UpdatePhaseSchema,
    currentVersion: z.string(),
    latestVersion: z.string().nullable(),
    available: z.boolean(),
    progress: z.number().min(0).max(1),
    error: z.string().nullable(),
    channel: ChannelSchema,
    showBanner: z.boolean(),
  })
  .strict()

export const GetUpdateStateParamsSchema = z.undefined()
export const GetUpdateStateResultSchema = UpdateStateSchema

export const CheckForUpdateParamsSchema = z.undefined()
export const CheckForUpdateResultSchema = UpdateStateSchema

export const StartUpdateDownloadParamsSchema = z.undefined()
export const StartUpdateDownloadResultSchema = VoidSchema

export const ApplyUpdateParamsSchema = z.undefined()
export const ApplyUpdateResultSchema = VoidSchema

export const DismissUpdateParamsSchema = z
  .object({ version: z.string().min(1) })
  .strict()
export const DismissUpdateResultSchema = VoidSchema

export const SetUpdateChannelParamsSchema = z
  .object({ channel: ChannelSchema })
  .strict()
export const SetUpdateChannelResultSchema = UpdateStateSchema

// ── Client logging (webview → main) ─────────────────────────────────────────
// The webview forwards error/fatal records here so they persist to the main log file.
// Inbound-only; redacted main-side. `level` is restricted to the two forwarded severities.
export const LogClientErrorParamsSchema = z
  .object({
    scope: z.string().min(1),
    level: z.enum(["error", "fatal"]),
    msg: z.string(),
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
export const LogClientErrorResultSchema = VoidSchema

// ── The method → {params, result} schema map ──────────────────────────────────

/** Maps each contract method to its on-the-wire param + result zod schemas. */
export const IpcMethodSchemas = {
  getProviders: {
    params: GetProvidersParamsSchema,
    result: GetProvidersResultSchema,
  },
  getProviderCatalog: {
    params: GetProviderCatalogParamsSchema,
    result: GetProviderCatalogResultSchema,
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
  deleteSession: {
    params: DeleteSessionParamsSchema,
    result: DeleteSessionResultSchema,
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
  testProviderDraft: {
    params: TestProviderDraftParamsSchema,
    result: TestProviderDraftResultSchema,
  },
  listProviderModelsDraft: {
    params: ListProviderModelsDraftParamsSchema,
    result: ListProviderModelsDraftResultSchema,
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
  deleteProject: {
    params: DeleteProjectParamsSchema,
    result: DeleteProjectResultSchema,
  },
  resetApp: {
    params: ResetAppParamsSchema,
    result: ResetAppResultSchema,
  },
  updateHarnessPrefs: {
    params: UpdateHarnessPrefsParamsSchema,
    result: UpdateHarnessPrefsResultSchema,
  },
  getUpdateState: {
    params: GetUpdateStateParamsSchema,
    result: GetUpdateStateResultSchema,
  },
  checkForUpdate: {
    params: CheckForUpdateParamsSchema,
    result: CheckForUpdateResultSchema,
  },
  startUpdateDownload: {
    params: StartUpdateDownloadParamsSchema,
    result: StartUpdateDownloadResultSchema,
  },
  applyUpdate: {
    params: ApplyUpdateParamsSchema,
    result: ApplyUpdateResultSchema,
  },
  dismissUpdate: {
    params: DismissUpdateParamsSchema,
    result: DismissUpdateResultSchema,
  },
  setUpdateChannel: {
    params: SetUpdateChannelParamsSchema,
    result: SetUpdateChannelResultSchema,
  },
  logClientError: {
    params: LogClientErrorParamsSchema,
    result: LogClientErrorResultSchema,
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
