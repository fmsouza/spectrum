import type { IpcError } from "@spectrum/ipc"
import type { ProviderCatalogEntry } from "@spectrum/providers"
import { type Result, ok } from "@spectrum/utils"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/** Loads the static, read-only provider catalog used to render dynamic provider forms. */
export const useProviderCatalog = (): AsyncResource<
  readonly ProviderCatalogEntry[]
> => {
  const client = useIpcClient()
  const call = useCallback(async (): Promise<
    Result<readonly ProviderCatalogEntry[], IpcError>
  > => {
    const r = await client.getProviderCatalog(undefined)
    if (!r.ok) return r
    return ok(r.value as readonly ProviderCatalogEntry[])
  }, [client])
  return useAsyncResource(call)
}
