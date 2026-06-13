import type { IpcError } from "@spectrum/ipc"
import type { ProviderId } from "@spectrum/types"
import { type Result, ok } from "@spectrum/utils"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/**
 * Fetch the live model list for the given provider id.
 *
 * - When `providerId` is empty, returns `{ data: [], loading: false, error: undefined }` immediately
 *   without making an IPC call.
 * - Re-fetches automatically whenever `providerId` changes (via `useAsyncResource`'s dependency on
 *   the memoised `call` callback, which closes over the current `providerId`).
 *
 * SECURITY: the apiKey is resolved server-side and never crosses to the view. This hook only
 * receives the final model names.
 */
export const useProviderModels = (
  providerId: string,
): AsyncResource<readonly string[]> => {
  const client = useIpcClient()

  const call = useCallback(async (): Promise<
    Result<readonly string[], IpcError>
  > => {
    if (providerId === "") return ok([] as readonly string[])
    const r = await client.listProviderModels({
      providerId: providerId as ProviderId,
    })
    if (!r.ok) return r
    return ok(r.value.models as readonly string[])
  }, [client, providerId])

  return useAsyncResource(call)
}
