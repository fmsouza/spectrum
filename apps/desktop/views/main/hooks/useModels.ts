import type { ModelRoute } from "@launchkit/types"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

export const useModels = (): AsyncResource<readonly ModelRoute[]> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getModels(undefined), [client])
  return useAsyncResource(call)
}
