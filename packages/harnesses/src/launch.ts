import type { HarnessDefinition, ModelId } from "@launchkit/types"
import { type Result, err, isErr, ok, renderTemplate } from "@launchkit/utils"
import type { CommandResolver } from "./command-resolver"
import type { HarnessError } from "./errors"
import type { ProcessSpawner, SpawnedProcess } from "./process-spawner"
import { validateEnvTemplate } from "./validate-env-template"

export type LaunchRoute =
  | {
      readonly kind: "proxied"
      readonly proxyUrl: string
      readonly proxyKey: string
      readonly modelId: ModelId
    }
  | { readonly kind: "direct" }

export interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly route: LaunchRoute
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

export interface ResolvedHarnessLaunch {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Record<string, string>
}

export const resolveHarnessLaunch =
  (deps: { readonly resolver: CommandResolver }) =>
  (params: LaunchParams): Result<ResolvedHarnessLaunch, HarnessError> => {
    const { harness, route } = params

    // Resolve + validate the command in BOTH modes (rejects relative / `..`).
    const resolved = deps.resolver.resolve(harness.command)
    if (isErr(resolved)) return resolved

    // Direct (bypass) mode: do NOT render the proxy envTemplate. The harness uses its own
    // native credentials/model and the proxy is not involved. Only caller env is passed.
    if (route.kind === "direct") {
      return ok({
        command: resolved.value,
        args: [],
        env: { ...(params.env ?? {}) },
      })
    }

    // Proxied mode: restrict env-template tokens, then render with the three allowed vars.
    const templateCheck = validateEnvTemplate(harness.envTemplate)
    if (isErr(templateCheck)) return templateCheck

    const vars: Readonly<Record<string, string>> = {
      proxyUrl: route.proxyUrl,
      proxyKey: route.proxyKey,
      model: String(route.modelId),
    }
    const env: Record<string, string> = {}
    for (const [key, template] of Object.entries(harness.envTemplate)) {
      const rendered = renderTemplate(template, vars)
      if (isErr(rendered)) {
        return err({ kind: "invalid-template", token: rendered.error.token })
      }
      env[key] = rendered.value
    }

    // Render any argsTemplate with the same tokens. Some harnesses need CLI flags (not just env) to
    // route through the proxy — codex, for one, only honors its config.toml provider, so we pass
    // `-c` provider overrides here. Harnesses without an argsTemplate get an empty args array.
    const args: string[] = []
    for (const template of harness.argsTemplate ?? []) {
      const rendered = renderTemplate(template, vars)
      if (isErr(rendered)) {
        return err({ kind: "invalid-template", token: rendered.error.token })
      }
      args.push(rendered.value)
    }

    // params.env WINS over the rendered template env (callers can override / add vars).
    return ok({
      command: resolved.value,
      args,
      env: { ...env, ...(params.env ?? {}) },
    })
  }

export const launchHarness =
  (deps: {
    readonly resolver: CommandResolver
    readonly spawner: ProcessSpawner
  }) =>
  (params: LaunchParams): Result<SpawnedProcess, HarnessError> => {
    const resolved = resolveHarnessLaunch({ resolver: deps.resolver })(params)
    if (isErr(resolved)) return resolved
    const { command, args, env } = resolved.value
    return deps.spawner.spawn(command, [...args], env, params.cwd)
  }
