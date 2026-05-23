import { type Result, ok, err } from "@launchkit/utils"
import type { Config } from "@launchkit/config"
import type { Provider } from "@launchkit/types"
import type { ProxyError } from "./types"

export interface Router { resolve(alias: string): Result<{ provider: Provider; providerModel: string }, ProxyError> }

export const createRouter = (config: Config): Router => {
  const providers = new Map(config.providers.map((p) => [p.id as string, p]))
  const aliases = new Map(config.aliases.map((a) => [a.alias as string, a]))
  return {
    resolve: (alias) => {
      const a = aliases.get(alias)
      if (a === undefined) return err({ kind: "unknown-alias", alias })
      const provider = providers.get(a.providerId as string)
      if (provider === undefined) return err({ kind: "unknown-provider", providerId: a.providerId as string })
      return ok({ provider, providerModel: a.providerModel })
    },
  }
}
