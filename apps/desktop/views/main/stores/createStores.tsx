import type { IpcClient } from "@launchkit/ipc"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useState,
} from "react"
import type { StoreApi } from "zustand/vanilla"
import { type HarnessesStore, createHarnessesStore } from "./harnessesStore"
import { type ModelsStore, createModelsStore } from "./modelsStore"
import { type ProfilesStore, createProfilesStore } from "./profilesStore"
import { type ProvidersStore, createProvidersStore } from "./providersStore"
import { type ProxyStore, createProxyStore } from "./proxyStore"
import { type SessionsStore, createSessionsStore } from "./sessionsStore"
import type { StoreDeps } from "./types"

/** The full bundle of domain stores. Grows as each domain is migrated. */
export type Stores = {
  readonly proxy: StoreApi<ProxyStore>
  readonly providers: StoreApi<ProvidersStore>
  readonly models: StoreApi<ModelsStore>
  readonly harnesses: StoreApi<HarnessesStore>
  readonly profiles: StoreApi<ProfilesStore>
  readonly sessions: StoreApi<SessionsStore>
}

export type CreateStoresOptions = {
  readonly client: IpcClient
}

/** Build every store once with the injected client. */
export const createStores = ({ client }: CreateStoresOptions): Stores => {
  const deps: StoreDeps = { client }
  return {
    proxy: createProxyStore(deps),
    providers: createProvidersStore(deps),
    models: createModelsStore(deps),
    harnesses: createHarnessesStore(deps),
    profiles: createProfilesStore(deps),
    sessions: createSessionsStore(deps),
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
