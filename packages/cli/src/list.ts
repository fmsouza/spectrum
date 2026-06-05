import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

const LIST_TARGETS = ["harnesses", "providers", "models", "profiles"] as const

const listHarnesses = async (
  deps: CliDeps,
): Promise<Result<void, CliError>> => {
  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })
  for (const h of listed.value) {
    deps.out.write(`${h.id}\t${h.name}\t(${h.apiFormat})`)
  }
  return ok(undefined)
}

const listProviders = async (
  deps: CliDeps,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const p of loaded.value.providers) {
    // SECURITY: print only non-secret identity — never `p.secrets` (the keychain refs).
    deps.out.write(`${p.id}\t${p.name}\t[${p.sdkProvider}]`)
  }
  return ok(undefined)
}

const listModels = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const m of loaded.value.models) {
    deps.out.write(`${m.id}\t-> ${m.providerId} / ${m.providerModel}`)
  }
  return ok(undefined)
}

const listProfiles = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const p of loaded.value.profiles) {
    deps.out.write(
      `${p.id}\t${p.name}\t[${p.harnessId} · ${p.modelId ?? "default"}]`,
    )
  }
  return ok(undefined)
}

/** `list harnesses | providers | models | profiles`. */
export const list = async (
  deps: CliDeps,
  rest: readonly string[],
): Promise<Result<void, CliError>> => {
  const target = rest[0]
  switch (target) {
    case "harnesses":
      return listHarnesses(deps)
    case "providers":
      return listProviders(deps)
    case "models":
      return listModels(deps)
    case "profiles":
      return listProfiles(deps)
    default:
      return err({ kind: "usage", detail: `list <${LIST_TARGETS.join("|")}>` })
  }
}
