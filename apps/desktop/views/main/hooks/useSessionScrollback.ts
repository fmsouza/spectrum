import type { IpcError } from "@launchkit/ipc"
import { base64ToBytes } from "@launchkit/pty"
import type { SessionId } from "@launchkit/types"
import { type Result, ok } from "@launchkit/utils"
import { useCallback } from "react"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/** Fetches a finished session's scrollback and decodes bytesBase64 to bytes for the replay pane. */
export const useSessionScrollback = (
  id: SessionId,
): AsyncResource<Uint8Array> => {
  const client = useIpcClient()
  const call = useCallback(async (): Promise<Result<Uint8Array, IpcError>> => {
    const r = await client.getSessionScrollback({ id })
    return r.ok ? ok(base64ToBytes(r.value.bytesBase64)) : r
  }, [client, id])
  return useAsyncResource(call)
}
