import { PermissionModeSchema } from "@spectrum/agent-events"
import type { IpcHandlers, ProviderView } from "@spectrum/ipc"
import { providerCatalog, validateProviderConfig } from "@spectrum/providers"
import type { ModelId, ModelRoute, Provider, SecretRef } from "@spectrum/types"
import { isOk } from "@spectrum/utils"
import type { AppContext } from "../../composition"
import { decideBanner } from "../updater/policy"
import type { Channel } from "../updater/updater-adapter"

/**
 * Project a `Provider` to the secret-free `ProviderView` that crosses IPC to the webview.
 * SECURITY (security.md): `secrets` (keychain refs) is replaced by presence flags only — no `ref`,
 * no value ever leaves the main process. This is the single mapping the masking tests pin.
 */
const toProviderView = (provider: Provider): ProviderView => ({
  id: provider.id,
  name: provider.name,
  sdkProvider: provider.sdkProvider,
  config: provider.config,
  secretFields: Object.fromEntries(
    Object.keys(provider.secrets).map(
      (field) => [field, { isSet: true }] as const,
    ),
  ),
  models: provider.models,
})

/** Raised inside a handler so the ipc server wraps it as a typed handler-failed IpcError. */
const fail = (message: string): never => {
  throw new Error(message)
}

/**
 * Bind the `@spectrum/ipc` contract to the wired subsystems. Each handler is `async` and either
 * returns the validated result shape or throws (the ipc server turns a throw into a `handler-failed`
 * IpcError; nothing leaks a stack trace because the server stringifies `error.message` only).
 * `void` results are encoded as `null` (the ipc VoidSchema), matching `04-ipc.md`.
 */
export const createIpcHandlers = (ctx: AppContext): IpcHandlers => {
  /** Load config or throw a message-safe handler error. */
  const loadConfig = async () => {
    const loaded = await ctx.config.load()
    if (!isOk(loaded)) return fail("could not load config")
    return loaded.value
  }

  /**
   * Build the full UpdateState by combining the raw adapter snapshot with the
   * config-owned channel and dismissal fields. Pure helper — no side effects.
   */
  const buildUpdateState = async (): Promise<
    import("@spectrum/ipc").IpcMethods["getUpdateState"]["result"]
  > => {
    const config = await loadConfig()
    const channel = config.settings.updateChannel as Channel
    const dismissed = config.settings.dismissedUpdateVersion
    const raw = ctx.updater.getRaw()
    const showBanner =
      decideBanner({
        available: raw.available,
        latestVersion: raw.latestVersion,
        dismissedVersion: dismissed,
      }) === "show"
    return { ...raw, channel, showBanner }
  }

  return {
    // ── Providers ──────────────────────────────────────────────────────────────────────
    getProviders: async () => {
      const config = await loadConfig()
      return config.providers.map(toProviderView)
    },

    getProviderCatalog: async () => [...providerCatalog()],

    addProvider: async (input) => {
      const config = await loadConfig()
      const valid = validateProviderConfig(input.sdkProvider, input.config)
      if (!valid.ok) return fail(`invalid provider config: ${valid.error.kind}`)
      // A blank/missing name falls back to the SDK provider name so a persisted provider always
      // has a RESOLVED non-empty name (ProviderSchema.name stays min(1)). The fallback lives here
      // so the rule is consistent for every IPC client.
      const name =
        input.name !== undefined && input.name.trim() !== ""
          ? input.name.trim()
          : input.sdkProvider
      // Build a Provider from the NON-secret input. secrets start empty — a value can only be set
      // later via setProviderSecret, never through this path (security.md).
      const provider: Provider = {
        id: `p_${crypto.randomUUID()}` as Provider["id"],
        name,
        sdkProvider: input.sdkProvider,
        config: input.config,
        secrets: {},
        models: input.models,
      }
      const saved = await ctx.config.save({
        ...config,
        providers: [...config.providers, provider],
      })
      if (!isOk(saved)) return fail("could not save provider")
      return toProviderView(provider)
    },

    updateProvider: async ({ id, input }) => {
      const config = await loadConfig()
      const existing = config.providers.find((p) => p.id === id)
      if (existing === undefined) return fail(`unknown provider: ${String(id)}`)
      const valid = validateProviderConfig(input.sdkProvider, input.config)
      if (!valid.ok) return fail(`invalid provider config: ${valid.error.kind}`)
      // Same fallback as addProvider: a blank/missing name resolves to the SDK provider name.
      const name =
        input.name !== undefined && input.name.trim() !== ""
          ? input.name.trim()
          : input.sdkProvider
      // Preserve existing secret refs; only non-secret fields are updatable over IPC.
      const updated: Provider = {
        ...existing,
        name,
        sdkProvider: input.sdkProvider,
        config: input.config,
        models: input.models,
      }
      const providers = config.providers.map((p) => (p.id === id ? updated : p))
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not save provider")
      return toProviderView(updated)
    },

    deleteProvider: async ({ id }) => {
      const config = await loadConfig()
      const providers = config.providers.filter((p) => p.id !== id)
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not delete provider")
      return null
    },

    testProvider: async ({ id }) => {
      // Delegates to the tester wired by the tray-and-polish plan (see AppContext.testProvider).
      const result = await ctx.testProvider(String(id))
      if (!isOk(result)) return fail("provider test failed")
      return result.value
    },

    setProviderSecret: async ({ providerId, field, value }) => {
      const config = await loadConfig()
      const existing = config.providers.find((p) => p.id === providerId)
      if (existing === undefined)
        return fail(`unknown provider: ${String(providerId)}`)

      // The ONLY inbound secret path: write the raw value straight to the keychain ...
      const set = await ctx.secrets.set(value)
      if (!isOk(set)) return fail("could not store secret")
      const ref: SecretRef = set.value

      // ... then persist ONLY the returned ref on the provider (never the value).
      const updated: Provider = {
        ...existing,
        secrets: { ...existing.secrets, [field]: ref },
      }
      const providers = config.providers.map((p) =>
        p.id === providerId ? updated : p,
      )
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not save secret reference")
      return null
    },

    // ── Models ───────────────────────────────────────────────────────────────────────
    getModels: async () => {
      const config = await loadConfig()
      return config.models
    },

    addModel: async (input) => {
      const config = await loadConfig()
      const model: ModelRoute = {
        id: `mdl_${crypto.randomUUID()}` as ModelRoute["id"],
        providerId: input.providerId,
        providerModel: input.providerModel,
      }
      const saved = await ctx.config.save({
        ...config,
        models: [...config.models, model],
      })
      if (!isOk(saved)) return fail("could not save model")
      return model
    },

    updateModel: async ({ id, input }) => {
      const config = await loadConfig()
      const next: ModelRoute = {
        id,
        providerId: input.providerId,
        providerModel: input.providerModel,
      }
      const models = config.models.map((m) => (m.id === id ? next : m))
      const saved = await ctx.config.save({ ...config, models })
      if (!isOk(saved)) return fail("could not update model")
      return next
    },

    deleteModel: async ({ id }) => {
      const config = await loadConfig()
      const models = config.models.filter((m) => m.id !== id)
      const saved = await ctx.config.save({ ...config, models })
      if (!isOk(saved)) return fail("could not delete model")
      return null
    },

    // ── Harnesses ──────────────────────────────────────────────────────────────────────
    getHarnesses: async () => {
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      return listed.value.map((def) => ({
        ...def,
        native: ctx.driverRegistry.isNative(def.id),
      }))
    },

    launchHarness: async ({ id, modelId, name, cwd, env }) => {
      const config = await loadConfig()
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      const harness = listed.value.find((h) => h.id === id)
      if (harness === undefined) return fail(`unknown harness: ${String(id)}`)

      // Restore the last-used permission mode for this harness (persisted per-harness). Stored as a
      // plain string; coerce against the canonical PermissionMode and ignore anything unrecognized.
      const storedMode =
        config.settings.lastByHarness?.[String(harness.id)]?.mode
      const parsedMode =
        storedMode === undefined
          ? undefined
          : PermissionModeSchema.safeParse(storedMode)
      const permissionMode = parsedMode?.success ? parsedMode.data : undefined

      // Resolve the effective model: an explicit launch model wins; otherwise the persisted per-harness
      // one (a stored "" means "default" — no model). This lets the modal drop its model selector.
      const storedModel = config.settings.lastByHarness?.[String(id)]?.modelId
      const effectiveModelId: ModelId | undefined =
        modelId ??
        (storedModel !== undefined && storedModel !== ""
          ? (storedModel as ModelId)
          : undefined)

      // modelId present → route through the proxy; absent → "default" = bypass the proxy.
      let route: import("@spectrum/harnesses").LaunchRoute
      if (effectiveModelId === undefined) {
        route = { kind: "direct" }
      } else {
        const proxyUrl = `http://${config.settings.proxyHost}:${config.settings.proxyPort}`
        // The GUI proxy runs persistently and stored its per-run key in runtime state; reuse it so
        // the running proxy accepts the harness's requests. If absent, mint a fresh key (security.md).
        const proxyKey = (await ctx.runtime.readProxyKey()) ?? ctx.genProxyKey()
        route = {
          kind: "proxied",
          proxyUrl,
          proxyKey,
          modelId: effectiveModelId,
        }
      }

      // Resolve the command (+ render the proxy env for a proxied route) WITHOUT spawning.
      const resolved = ctx.resolveLaunch({ harness, route })
      if (!isOk(resolved)) return fail("failed to resolve harness launch")

      // Defense in depth: coerce empty/blank name & cwd to undefined so no path
      // ever creates a session with name:"" (which fails SessionSchema's min(1)
      // on the next getSessions) or an empty cwd. The webview already omits them,
      // but a future caller — or the tray — must not be able to slip a "" through.
      const safeName = name?.trim() ? name : undefined
      const safeCwd = cwd?.trim() ? cwd : undefined

      // Every launchable harness is native now — it launches through the RunManager. A harness
      // without a registered driver has no way to run, so reject it rather than silently no-op.
      if (!ctx.driverRegistry.isNative(harness.id))
        return fail("harness has no native driver")

      const launchedNative = ctx.runner.launch({
        harnessId: harness.id,
        ...(effectiveModelId === undefined
          ? {}
          : { modelId: effectiveModelId }),
        ...(permissionMode === undefined ? {} : { permissionMode }),
        env: { ...resolved.value.env, ...(env ?? {}) },
        cwd: safeCwd ?? "",
        // The SDK-backed driver spawns this resolved `claude` binary directly — its own
        // bundle-relative executable resolution finds no cli.js in the packaged app.
        command: resolved.value.command,
        // Forward the resolved launch args too: codex routes through the proxy ONLY via its
        // `-c model_providers.spectrum.*` overrides (not env), so a native codex session needs
        // them. Drivers that route via env ignore this.
        args: resolved.value.args,
        ...(safeName === undefined ? {} : { name: safeName }),
      })
      if (!isOk(launchedNative)) return fail("failed to launch native harness")

      // Remember the launched harness/cwd so the New Session modal can prefill them next
      // time. Persist on success only (a cancelled modal must not change the prefill). Harness
      // is always recorded; the folder is only updated when a cwd was actually given
      // (otherwise the previously remembered folder is kept). Model persistence happens
      // through the composer's `updateHarnessPrefs` instead. A save failure here is
      // non-fatal — the session already launched.
      await ctx.config.save({
        ...config,
        settings: {
          ...config.settings,
          lastSelectedHarnessId: harness.id,
          ...(safeCwd === undefined ? {} : { lastSelectedFolder: safeCwd }),
        },
      })
      return { sessionId: launchedNative.value.sessionId }
    },

    // ── Sessions & proxy ─────────────────────────────────────────────────────────────────
    getSessions: async (filter) => {
      // Build a SessionFilter from IPC params, handling exactOptionalPropertyTypes
      const sessionFilter =
        filter === undefined
          ? undefined
          : (Object.fromEntries(
              Object.entries(filter).filter(([, v]) => v !== undefined),
            ) as import("@spectrum/sessions").SessionFilter)
      const queried = ctx.sessions.query(sessionFilter)
      if (!isOk(queried)) return fail("could not query sessions")
      return [...queried.value]
    },

    deleteSession: async ({ sessionId }) => {
      const deleted = ctx.dataAdmin.deleteSession(sessionId)
      if (!isOk(deleted)) return fail("could not delete session")
      return null
    },

    getProxyStatus: async () => {
      const running = await ctx.proxy.isRunning(ctx.proxyBaseUrl)
      return { running, port: ctx.proxyPort }
    },

    getRunnerSocketUrl: async () => ({ url: ctx.runnerSocketUrl }),

    // ── Run events (canonical replay) ────────────────────────────────────────────
    getRunEvents: async ({ id }) => {
      const read = ctx.runEvents.read(id)
      if (!isOk(read)) return fail("could not read run events")
      return { events: [...read.value] }
    },

    getSettings: async () => {
      const config = await loadConfig()
      return {
        lastSelectedFolder: config.settings.lastSelectedFolder,
        lastSelectedHarnessId: config.settings.lastSelectedHarnessId,
        collapsedProjects: config.settings.collapsedProjects,
      }
    },

    // ── Projects ──────────────────────────────────────────────────────────────
    getProjects: async () => {
      const result = ctx.projects.list()
      if (!isOk(result)) return fail("could not list projects")
      return result.value.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        sessionCount: p.sessionCount,
      }))
    },

    setCollapsedProjects: async ({ ids }) => {
      const config = await loadConfig()
      const saved = await ctx.config.save({
        ...config,
        settings: { ...config.settings, collapsedProjects: ids },
      })
      if (!isOk(saved)) return fail("could not save collapsed projects")
      return null
    },

    deleteProject: async ({ projectId }) => {
      const deleted = ctx.dataAdmin.deleteProject(projectId)
      if (!isOk(deleted)) return fail("could not delete project")
      return null
    },

    // ── Data (factory reset) ────────────────────────────────────────────────
    resetApp: async () => {
      const reset = await ctx.resetApp()
      if (!isOk(reset)) return fail("could not reset app")
      return null
    },

    updateHarnessPrefs: async ({ harnessId, mode, modelId }) => {
      const config = await loadConfig()
      const prev = config.settings.lastByHarness ?? {}
      const key = String(harnessId)
      const nextEntry = {
        ...(prev[key] ?? {}),
        ...(mode === undefined ? {} : { mode }),
        ...(modelId === undefined ? {} : { modelId }),
      }
      const saved = await ctx.config.save({
        ...config,
        settings: {
          ...config.settings,
          lastByHarness: { ...prev, [key]: nextEntry },
        },
      })
      if (!isOk(saved)) return fail("could not save harness prefs")
      return null
    },

    // ── Updates ──────────────────────────────────────────────────────────────
    getUpdateState: async () => buildUpdateState(),

    checkForUpdate: async () => {
      const config = await loadConfig()
      // A failed check is non-fatal — the adapter records phase "error" in its
      // raw snapshot; we do NOT re-throw so the webview gets the error state.
      await ctx.updater.check(config.settings.updateChannel as Channel)
      return buildUpdateState()
    },

    startUpdateDownload: async () => {
      ctx.updater.startDownload()
      return null
    },

    applyUpdate: async () => {
      // Fire-and-forget: apply() may relaunch the app and never return.
      void ctx.updater.apply()
      return null
    },

    dismissUpdate: async ({ version }: { version: string }) => {
      const config = await loadConfig()
      const saved = await ctx.config.save({
        ...config,
        settings: {
          ...config.settings,
          dismissedUpdateVersion: version,
        },
      })
      if (!isOk(saved)) return fail("could not persist dismissed version")
      return null
    },

    setUpdateChannel: async ({ channel }: { channel: Channel }) => {
      const config = await loadConfig()
      const saved = await ctx.config.save({
        ...config,
        settings: { ...config.settings, updateChannel: channel },
      })
      if (!isOk(saved)) return fail("could not persist update channel")
      const switched = await ctx.updater.setChannel(channel)
      if (!isOk(switched)) return fail("could not switch update channel")
      // Re-check so the returned state reflects the latest status. NOTE: the engine
      // still follows the pre-restart channel (version.json is cached for the process),
      // so this queries the current channel until Spectrum restarts — see setChannel.
      await ctx.updater.check(channel)
      return buildUpdateState()
    },

    // ── Dialogs ───────────────────────────────────────────────────────────────
    pickFolder: async (params) => {
      const startingFolder = params?.startingFolder
      const selected = await ctx.pickFolder(
        startingFolder === undefined ? {} : { startingFolder },
      )
      const first = selected[0]
      return first === undefined ? {} : { path: first }
    },

    // ── Model discovery ────────────────────────────────────────────────────────
    listProviderModels: async ({ providerId }) => {
      const result = await ctx.listProviderModels(String(providerId))
      if (!isOk(result)) return fail("could not list provider models")
      return { models: [...result.value] }
    },

    // ── Client logging ──────────────────────────────────────────────────────
    logClientError: async ({ scope, level, msg, fields }) => {
      const child = ctx.log.child(`webview.${scope}`)
      if (level === "fatal") child.fatal(msg, fields)
      else child.error(msg, fields)
      return null
    },
  }
}
