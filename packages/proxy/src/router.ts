import type { Config } from "@launchkit/config"
import type { Provider } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import type { ProxyError } from "./types"

export interface Router {
  /** Resolve a request's model id to its provider and provider-native model. */
  resolve(
    id: string,
  ): Result<{ provider: Provider; providerModel: string }, ProxyError>
}

const resolveIn = (
  config: Config,
  id: string,
): Result<{ provider: Provider; providerModel: string }, ProxyError> => {
  const m = config.models.find((x) => (x.id as string) === id)
  if (m === undefined) return err({ kind: "unknown-model", id })
  const provider = config.providers.find(
    (p) => (p.id as string) === (m.providerId as string),
  )
  if (provider === undefined)
    return err({ kind: "unknown-provider", providerId: m.providerId as string })
  return ok({ provider, providerModel: m.providerModel })
}

/**
 * Build a model router. Accepts either a static `Config` or a `() => Config` getter; the getter form
 * resolves against the LATEST config on every call, so a long-running proxy reflects provider/model
 * changes (e.g. a model added in the GUI) without being rebuilt or restarted. Configs are small, so
 * resolving by linear scan per request is negligible.
 */
export const createRouter = (source: Config | (() => Config)): Router => {
  const get = typeof source === "function" ? source : () => source
  return { resolve: (id) => resolveIn(get(), id) }
}
