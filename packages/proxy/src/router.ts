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

export const createRouter = (config: Config): Router => {
  const providers = new Map(config.providers.map((p) => [p.id as string, p]))
  const models = new Map(config.models.map((m) => [m.id as string, m]))
  return {
    resolve: (id) => {
      const m = models.get(id)
      if (m === undefined) return err({ kind: "unknown-model", id })
      const provider = providers.get(m.providerId as string)
      if (provider === undefined)
        return err({
          kind: "unknown-provider",
          providerId: m.providerId as string,
        })
      return ok({ provider, providerModel: m.providerModel })
    },
  }
}
