import type { IpcMethods } from "@launchkit/ipc"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

export type ProxyStatus = IpcMethods["getProxyStatus"]["result"]

export const useProxyStatus = (): AsyncResource<ProxyStatus> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getProxyStatus(undefined), [client])
  return useAsyncResource(call)
}
