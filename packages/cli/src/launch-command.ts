import type { Config } from "@launchkit/config"
import type { RunningProxy } from "@launchkit/proxy"
import {
  type AliasName,
  AliasNameSchema,
  type HarnessDefinition,
  type Profile,
} from "@launchkit/types"
import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

/** Look up the `--profile <id>` profile in config, if the flag is present. */
const resolveProfile = (
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Result<Profile | undefined, CliError> => {
  const flag = flags.profile
  if (typeof flag !== "string") return ok(undefined)
  const found = config.profiles.find((p) => p.id === flag)
  return found === undefined
    ? err({ kind: "usage", detail: `unknown profile: ${flag}` })
    : ok(found)
}

/**
 * Resolve the harness id to launch: the positional `<harnessId>` wins; otherwise the
 * `--profile`'s harness. Errors only when neither is present.
 */
const resolveHarnessId = (
  positional: string | undefined,
  profile: Profile | undefined,
): Result<string, CliError> => {
  if (positional !== undefined) return ok(positional)
  if (profile !== undefined) return ok(String(profile.harnessId))
  return err({ kind: "usage", detail: "launch <harnessId> [--model <alias>]" })
}

/** Resolve the alias: `--model` wins, then the profile's alias, then the harness default. */
const resolveAlias = (
  harness: HarnessDefinition,
  profile: Profile | undefined,
  flags: Readonly<Record<string, string | boolean>>,
): AliasName => {
  const flag = flags.model
  if (typeof flag === "string") return AliasNameSchema.parse(flag)
  if (profile !== undefined) return profile.alias
  return harness.defaultAlias
}

/**
 * `launch [<harnessId>] [--profile <id>] [--model <alias>] [--name <name>] [--cwd <dir>]`.
 *
 * Loads config; if `--profile` is given, seeds the harness, alias, and env from it (a
 * positional `<harnessId>` and `--model` override the profile, and `--profile` makes the
 * positional id optional). Ensures a proxy is up (reusing a running one, else starting an
 * ephemeral one with a freshly generated per-run key), launches the harness with the
 * profile's env + `--cwd`, and records a session with `--name`/`--cwd`. SECURITY: the
 * generated proxy key flows only into `deps.launch(...)` — never to `deps.out.write`.
 */
export const launchCommand = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  const { settings } = loaded.value

  const profileResult = resolveProfile(loaded.value, flags)
  if (isErr(profileResult)) return profileResult
  const profile = profileResult.value

  const harnessIdResult = resolveHarnessId(rest[0], profile)
  if (isErr(harnessIdResult)) return harnessIdResult
  const harnessId = harnessIdResult.value

  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })

  const harness = listed.value.find((h) => h.id === harnessId)
  if (harness === undefined) {
    return err({ kind: "usage", detail: `unknown harness: ${harnessId}` })
  }

  const alias = resolveAlias(harness, profile, flags)
  const env = profile?.env ?? {}
  const cwd = typeof flags.cwd === "string" ? flags.cwd : undefined
  const name = typeof flags.name === "string" ? flags.name : undefined
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

  const launched = deps.launch({
    harness,
    proxyUrl,
    proxyKey,
    model: alias,
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
    alias,
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
