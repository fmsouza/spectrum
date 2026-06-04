import type { RunningProxy } from "@launchkit/proxy"
import {
  type AliasName,
  AliasNameSchema,
  type HarnessDefinition,
} from "@launchkit/types"
import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

/** Resolve the alias: the `--model` flag if a string, else the harness's defaultAlias. */
const resolveAlias = (
  harness: HarnessDefinition,
  flags: Readonly<Record<string, string | boolean>>,
): AliasName => {
  const flag = flags.model
  return typeof flag === "string"
    ? AliasNameSchema.parse(flag)
    : harness.defaultAlias
}

/**
 * `launch <harnessId> [--model <alias>]`.
 *
 * Loads config, finds the harness, resolves the alias, ensures a proxy is up (reusing a
 * running one, else starting an ephemeral one with a freshly generated per-run key), then
 * launches the harness and records a session. SECURITY: the generated proxy key flows only
 * into `deps.launch(...)` (which the harness launcher places in the child env) — it is
 * never passed to `deps.out.write`.
 */
export const launchCommand = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const harnessId = rest[0]
  if (harnessId === undefined) {
    return err({
      kind: "usage",
      detail: "launch <harnessId> [--model <alias>]",
    })
  }

  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  const { settings } = loaded.value

  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })

  const harness = listed.value.find((h) => h.id === harnessId)
  if (harness === undefined) {
    return err({ kind: "usage", detail: `unknown harness: ${harnessId}` })
  }

  const alias = resolveAlias(harness, flags)
  const proxyUrl = `http://${settings.proxyHost}:${settings.proxyPort}`

  // Ensure a proxy is up. Reuse a running one (reading its persisted per-run key so the
  // harness authenticates against it); otherwise start an ephemeral one and persist its key.
  const alreadyRunning = await deps.proxy.isRunning(proxyUrl)
  let proxyKey: string
  // The ephemeral proxy this run OWNS (started here) — null when reusing a running one. We keep
  // the handle so we can stop it after the harness exits (a reused proxy is never ours to stop).
  let owned: RunningProxy | null = null
  if (alreadyRunning) {
    // Reuse the running proxy's key so auth succeeds; fall back to a fresh one only if the
    // runtime file is missing (e.g. a proxy started outside this app).
    proxyKey = (await deps.runtime.readProxyKey()) ?? deps.genProxyKey()
  } else {
    proxyKey = deps.genProxyKey()
    owned = deps.proxy.start({
      host: settings.proxyHost,
      port: settings.proxyPort,
      proxyKey,
      config: loaded.value,
    })
    await deps.runtime.writeProxyKey(proxyKey)
  }

  const launched = deps.launch({ harness, proxyUrl, proxyKey, model: alias })
  if (isErr(launched)) {
    // Spawning failed: tear down the proxy we just started so we don't leak it.
    owned?.stop()
    return err({ kind: "failed", detail: "failed to launch harness" })
  }

  const session = deps.sessions.create({ harnessId: harness.id, alias })
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
