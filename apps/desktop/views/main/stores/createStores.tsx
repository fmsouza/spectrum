import type { IpcClient } from "@launchkit/ipc"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useState,
} from "react"
import type { StoreApi } from "zustand/vanilla"
import { type ProxyStore, createProxyStore } from "./proxyStore"
import type { StoreDeps } from "./types"

/** The full bundle of domain stores. Grows as each domain is migrated. */
export type Stores = {
  readonly proxy: StoreApi<ProxyStore>
}

export type CreateStoresOptions = {
  readonly client: IpcClient
}

/** Build every store once with the injected client. */
export const createStores = ({ client }: CreateStoresOptions): Stores => {
  const deps: StoreDeps = { client }
  return {
    proxy: createProxyStore(deps),
  }
}

const StoresContext = createContext<Stores | null>(null)

export type StoreProviderProps = {
  readonly client: IpcClient
  readonly children: ReactNode
}

/** Creates the store bundle once (per mount) and injects it via context. */
export const StoreProvider = ({
  client,
  children,
}: StoreProviderProps): ReactElement => {
  const [stores] = useState(() => createStores({ client }))
  return (
    <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>
  )
}

/** Read the injected store bundle. Throws if no provider is mounted. */
export const useStores = (): Stores => {
  const stores = useContext(StoresContext)
  if (stores === null) {
    throw new Error("useStores must be used within a StoreProvider")
  }
  return stores
}
