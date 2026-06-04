import type { IpcHandlers, ProviderView } from "@launchkit/ipc"
import { bytesToBase64 } from "@launchkit/pty"
import type { Profile, ProfileId, Provider, SecretRef } from "@launchkit/types"
import { isOk } from "@launchkit/utils"
import type { AppContext } from "../../composition"

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
 * Bind the `@launchkit/ipc` contract to the wired subsystems. Each handler is `async` and either
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

  return {
    // ── Providers ──────────────────────────────────────────────────────────────────────
    getProviders: async () => {
      const config = await loadConfig()
      return config.providers.map(toProviderView)
    },

    addProvider: async (input) => {
      const config = await loadConfig()
      // Build a Provider from the NON-secret input. secrets start empty — a value can only be set
      // later via setProviderSecret, never through this path (security.md).
      const provider: Provider = {
        id: `p_${crypto.randomUUID()}` as Provider["id"],
        name: input.name,
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
      // Preserve existing secret refs; only non-secret fields are updatable over IPC.
      const updated: Provider = {
        ...existing,
        name: input.name,
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

    // ── Aliases ────────────────────────────────────────────────────────────────────────
    getAliases: async () => {
      const config = await loadConfig()
      return config.aliases
    },

    addAlias: async (alias) => {
      const config = await loadConfig()
      const saved = await ctx.config.save({
        ...config,
        aliases: [...config.aliases, alias],
      })
      if (!isOk(saved)) return fail("could not save alias")
      return alias
    },

    updateAlias: async ({ alias, input }) => {
      const config = await loadConfig()
      const next = {
        alias,
        providerId: input.providerId,
        providerModel: input.providerModel,
      }
      const aliases = config.aliases.map((a) => (a.alias === alias ? next : a))
      const saved = await ctx.config.save({ ...config, aliases })
      if (!isOk(saved)) return fail("could not update alias")
      return next
    },

    deleteAlias: async ({ alias }) => {
      const config = await loadConfig()
      const aliases = config.aliases.filter((a) => a.alias !== alias)
      const saved = await ctx.config.save({ ...config, aliases })
      if (!isOk(saved)) return fail("could not delete alias")
      return null
    },

    // ── Harnesses ──────────────────────────────────────────────────────────────────────
    getHarnesses: async () => {
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      return [...listed.value]
    },

    addHarness: async (definition) => {
      // User-defined harnesses are files on disk; the registry validates + persists (builtIn forced
      // false, built-in id collisions rejected) and hot-reloads them on the next list.
      const res = await ctx.registry.add(definition)
      if (!isOk(res)) return fail("could not add harness")
      // Return the NORMALIZED definition: registry.add forces builtIn:false on disk, so the reply
      // must match what the next getHarnesses returns rather than echoing the raw caller input.
      return { ...definition, builtIn: false }
    },

    updateHarness: async ({ id, input }) => {
      // Update is an upsert by id: writeDefinition overwrites the existing file for this id.
      const updated = { ...input, id }
      const res = await ctx.registry.add(updated)
      if (!isOk(res)) return fail("could not update harness")
      // builtIn is forced false by the registry on persist; mirror that in the reply.
      return { ...input, id, builtIn: false }
    },

    deleteHarness: async ({ id }) => {
      const res = await ctx.registry.remove(String(id))
      if (!isOk(res)) return fail("could not delete harness")
      return null
    },

    launchHarness: async ({ id, alias, name, cwd, env }) => {
      const config = await loadConfig()
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      const harness = listed.value.find((h) => h.id === id)
      if (harness === undefined) return fail(`unknown harness: ${String(id)}`)

      const resolvedAlias = alias ?? harness.defaultAlias
      const proxyUrl = `http://${config.settings.proxyHost}:${config.settings.proxyPort}`
      // The GUI proxy runs persistently and stored its per-run key in runtime state; reuse it so the
      // running proxy accepts the harness's requests. If absent, mint a fresh key (security.md).
      const proxyKey = (await ctx.runtime.readProxyKey()) ?? ctx.genProxyKey()

      // Resolve the command + render the proxy env WITHOUT spawning ...
      const resolved = ctx.resolveLaunch({
        harness,
        proxyUrl,
        proxyKey,
        model: resolvedAlias,
      })
      if (!isOk(resolved)) return fail("failed to resolve harness launch")

      // Defense in depth: coerce empty/blank name & cwd to undefined so no path
      // ever creates a session with name:"" (which fails SessionSchema's min(1)
      // on the next getSessions) or an empty cwd. The webview already omits them,
      // but a future caller — or the tray — must not be able to slip a "" through.
      const safeName = name?.trim() ? name : undefined
      const safeCwd = cwd?.trim() ? cwd : undefined

      // Merge caller-supplied env ON TOP of the rendered proxy env (caller may add tokens/flags),
      // and thread the optional session metadata through. The manager owns Session creation.
      const opened = ctx.terminal.launch({
        harnessId: harness.id,
        alias: resolvedAlias,
        command: resolved.value.command,
        args: resolved.value.args,
        env: { ...resolved.value.env, ...(env ?? {}) },
        ...(safeName === undefined ? {} : { name: safeName }),
        ...(safeCwd === undefined ? {} : { cwd: safeCwd }),
      })
      if (!isOk(opened)) return fail("failed to launch harness")
      return { sessionId: opened.value.sessionId }
    },

    // ── Sessions & proxy ─────────────────────────────────────────────────────────────────
    getSessions: async (filter) => {
      // Build a SessionFilter from IPC params, handling exactOptionalPropertyTypes
      const sessionFilter =
        filter === undefined
          ? undefined
          : (Object.fromEntries(
              Object.entries(filter).filter(([, v]) => v !== undefined),
            ) as import("@launchkit/sessions").SessionFilter)
      const queried = ctx.sessions.query(sessionFilter)
      if (!isOk(queried)) return fail("could not query sessions")
      return [...queried.value]
    },

    getProxyStatus: async () => {
      const running = await ctx.proxy.isRunning(ctx.proxyBaseUrl)
      return { running, port: ctx.proxyPort }
    },

    getTerminalSocketUrl: async () => ({ url: ctx.terminalSocketUrl }),

    // ── Profiles ──────────────────────────────────────────────────────────────
    getProfiles: async () => {
      const config = await loadConfig()
      return config.profiles
    },

    addProfile: async (input) => {
      const config = await loadConfig()
      // Mint the id the same way addProvider mints provider ids (crypto.randomUUID + typed prefix).
      const profile: Profile = {
        id: `pr_${crypto.randomUUID()}` as ProfileId,
        name: input.name,
        harnessId: input.harnessId,
        alias: input.alias,
        env: input.env,
      }
      const saved = await ctx.config.save({
        ...config,
        profiles: [...config.profiles, profile],
      })
      if (!isOk(saved)) return fail("could not save profile")
      return profile
    },

    updateProfile: async (profile) => {
      const config = await loadConfig()
      const existing = config.profiles.find((p) => p.id === profile.id)
      if (existing === undefined)
        return fail(`unknown profile: ${String(profile.id)}`)
      const profiles = config.profiles.map((p) =>
        p.id === profile.id ? profile : p,
      )
      const saved = await ctx.config.save({ ...config, profiles })
      if (!isOk(saved)) return fail("could not save profile")
      return profile
    },

    deleteProfile: async ({ id }) => {
      const config = await loadConfig()
      const profiles = config.profiles.filter((p) => p.id !== id)
      const saved = await ctx.config.save({ ...config, profiles })
      if (!isOk(saved)) return fail("could not delete profile")
      return null
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

    // ── Session scrollback ────────────────────────────────────────────────────
    getSessionScrollback: async ({ id }) => {
      const read = ctx.readScrollback(id)
      if (!isOk(read)) return fail("could not read session scrollback")
      return { bytesBase64: bytesToBase64(read.value) }
    },

    // ── Model discovery (stub — real handler lands in the next dispatch) ──────
    listProviderModels: async () => {
      return fail("listProviderModels: not yet implemented")
    },
  }
}
