import type { AliasName, HarnessDefinition } from "@launchkit/types"
import { type Result, err, isErr, ok, renderTemplate } from "@launchkit/utils"
import type { CommandResolver } from "./command-resolver"
import type { HarnessError } from "./errors"
import type { ProcessSpawner, SpawnedProcess } from "./process-spawner"
import { validateEnvTemplate } from "./validate-env-template"

export interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly proxyUrl: string
  readonly proxyKey: string
  readonly model: AliasName
}

export interface ResolvedHarnessLaunch {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Record<string, string>
}

export const resolveHarnessLaunch =
  (deps: { readonly resolver: CommandResolver }) =>
  (params: LaunchParams): Result<ResolvedHarnessLaunch, HarnessError> => {
    const { harness, proxyUrl, proxyKey, model } = params

    // 1. Restrict env-template tokens to the allowed three.
    const templateCheck = validateEnvTemplate(harness.envTemplate)
    if (isErr(templateCheck)) return templateCheck

    // 2. Resolve + validate the command (rejects relative / `..`).
    const resolved = deps.resolver.resolve(harness.command)
    if (isErr(resolved)) return resolved

    // 3. Render each env value with only the three allowed variables.
    const vars: Readonly<Record<string, string>> = {
      proxyUrl,
      proxyKey,
      model: String(model),
    }
    const env: Record<string, string> = {}
    for (const [key, template] of Object.entries(harness.envTemplate)) {
      const rendered = renderTemplate(template, vars)
      if (isErr(rendered)) {
        return err({ kind: "invalid-template", token: rendered.error.token })
      }
      env[key] = rendered.value
    }

    return ok({ command: resolved.value, args: [], env })
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

    // Spawn with an EMPTY argument array — never a shell string.
    return deps.spawner.spawn(command, [...args], env)
  }
