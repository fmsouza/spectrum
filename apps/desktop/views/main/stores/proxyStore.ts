import type { IpcMethods } from "@launchkit/ipc"
import { type StoreApi, createStore } from "zustand/vanilla"
import { type ResourceState, createResource } from "./resource"
import type { StoreDeps } from "./types"

export type ProxyStatus = IpcMethods["getProxyStatus"]["result"]
export type ProxyStore = ResourceState<ProxyStatus>

export const createProxyStore = (deps: StoreDeps): StoreApi<ProxyStore> =>
  createStore<ProxyStore>()((set, get) => ({
    ...createResource<ProxyStatus>(
      () => deps.client.getProxyStatus(undefined),
      (patch) => set(patch),
      () => get().data,
    ),
  }))
