import type { Config } from "@launchkit/config"
import type { LaunchRoute } from "@launchkit/harnesses"
import type { RunningProxy } from "@launchkit/proxy"
import { type ModelId, ModelIdSchema } from "@launchkit/types"
import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

/**
 * Resolve the harness id to launch: the positional `<harnessId>` is required.
 * Errors when it is absent.
 */
const resolveHarnessId = (
  positional: string | undefined,
): Result<string, CliError> => {
  if (positional !== undefined) return ok(positional)
  return err({ kind: "usage", detail: "launch <harnessId> [--model <id>]" })
}

/** Resolve the model id: `--model` wins; absent ⇒ default (bypass). */
const resolveModel = (
  flags: Readonly<Record<string, string | boolean>>,
): ModelId | undefined => {
  const flag = flags.model
  if (typeof flag === "string") return ModelIdSchema.parse(flag)
  return undefined
}

/**
 * Ensure a proxy is up for a PROXIED launch and return the route plus the proxy this run OWNS
 * (`null` when we reused an already-running one). Reuses a running proxy's persisted per-run key
 * so the harness authenticates against it; otherwise mints a fresh key, starts an ephemeral proxy
 * and persists the key. SECURITY: the key lives only in the returned route (→ `deps.launch`).
 */
const ensureProxiedRoute = async (
  deps: CliDeps,
  config: Config,
  modelId: ModelId,
): Promise<{ route: LaunchRoute; owned: RunningProxy | null }> => {
  const { settings } = config
  const proxyUrl = `http://${settings.proxyHost}:${settings.proxyPort}`
  const alreadyRunning = await deps.proxy.isRunning(proxyUrl)
  if (alreadyRunning) {
    // Reuse the running proxy's key so auth succeeds; fall back to a fresh one only if the
    // runtime file is missing (e.g. a proxy started outside this app).
    const proxyKey = (await deps.runtime.readProxyKey()) ?? deps.genProxyKey()
    return {
      route: { kind: "proxied", proxyUrl, proxyKey, modelId },
      owned: null,
    }
  }
  const proxyKey = deps.genProxyKey()
  const owned = deps.proxy.start({
    host: settings.proxyHost,
    port: settings.proxyPort,
    proxyKey,
    config,
  })
  await deps.runtime.writeProxyKey(proxyKey)
  return { route: { kind: "proxied", proxyUrl, proxyKey, modelId }, owned }
}

/**
 * `launch <harnessId> [--model <id>] [--name <name>] [--cwd <dir>]`.
 *
 * Loads config. The resolved model id decides the route:
 *  - no model (default) ⇒ a DIRECT route that bypasses the proxy entirely (none is started
 *    or even probed), and the session is recorded without a model id;
 *  - a model id ⇒ a PROXIED route: ensure a proxy is up (reuse a running one, else start an
 *    ephemeral one with a freshly generated per-run key) and pass it to the harness.
 * Launches the harness with `--cwd`, and records a session with `--name`/`--cwd`.
 * SECURITY: the generated proxy key flows only into `deps.launch(...)` —
 * never to `deps.out.write`.
 */
export const launchCommand = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })

  const harnessIdResult = resolveHarnessId(rest[0])
  if (isErr(harnessIdResult)) return harnessIdResult
  const harnessId = harnessIdResult.value

  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })

  const harness = listed.value.find((h) => h.id === harnessId)
  if (harness === undefined) {
    return err({ kind: "usage", detail: `unknown harness: ${harnessId}` })
  }

  const modelId = resolveModel(flags)
  const env = {}
  const cwd = typeof flags.cwd === "string" ? flags.cwd : undefined
  const name = typeof flags.name === "string" ? flags.name : undefined

  // Build the launch route from the resolved model. No model ⇒ DIRECT (bypass): never probe or
  // start a proxy, and there is no proxy this run owns. A model id ⇒ PROXIED: ensure a proxy is
  // up and keep the handle for any ephemeral one we OWN (so we can stop it after the harness
  // exits — a reused, already-running proxy is never ours to stop).
  const { route, owned } =
    modelId === undefined
      ? { route: { kind: "direct" } as LaunchRoute, owned: null }
      : await ensureProxiedRoute(deps, loaded.value, modelId)

  const launched = deps.launch({
    harness,
    route,
    ...(cwd !== undefined ? { cwd } : {}),
    env,
  })
  if (isErr(launched)) {
    // Spawning failed: tear down the proxy we just started so we don't leak it.
    owned?.stop()
    return err({ kind: "failed", detail: "failed to launch harness" })
  }

  const session = deps.sessions.create({
    harnessId: harness.id,
    ...(modelId !== undefined ? { modelId } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
  })
  if (isErr(session)) {
    owned?.stop()
    return err({ kind: "failed", detail: "failed to record session" })
  }

  deps.out.write(
    `launched ${harness.id} (pid ${launched.value.pid}, session ${session.value.id})`,
  )

  // Run the harness in the FOREGROUND: keep this process (and any ephemeral proxy we started)
  // alive until the harness exits, so an interactive TUI owns the terminal and can talk to the
  // proxy. Then stop the proxy we OWN (never a reused, externally-running one).
  await launched.value.exited
  owned?.stop()
  return ok(undefined)
}
