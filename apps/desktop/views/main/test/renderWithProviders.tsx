import type { IpcClient } from "@launchkit/ipc"
import { type RenderResult, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { IpcClientProvider } from "../IpcClientContext"
import { StoreProvider } from "../stores/createStores"

/** Render UI wrapped in BOTH the IPC client and the store providers. */
export const renderWithProviders = (
  ui: ReactElement,
  client: IpcClient,
): RenderResult =>
  render(
    <IpcClientProvider client={client}>
      <StoreProvider client={client}>{ui}</StoreProvider>
    </IpcClientProvider>,
  )
