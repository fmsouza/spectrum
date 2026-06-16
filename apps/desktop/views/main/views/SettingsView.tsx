import { SettingsNav } from "@spectrum/ui"
import type { ReactElement, ReactNode } from "react"
import { ErrorBoundary } from "../ErrorBoundary"
import { useIpcClient } from "../IpcClientContext"
import { useNotifications } from "../hooks/useNotifications"
import {
  DataPage,
  GeneralPage,
  HarnessesPage,
  ModelsPage,
  ProvidersPage,
} from "../pages"

const SECTIONS = [
  { key: "general", label: "General" },
  { key: "providers", label: "Providers" },
  { key: "models", label: "Models" },
  { key: "harnesses", label: "Harnesses" },
  { key: "data", label: "Data" },
] as const

/**
 * Connects `DataPage` to the IPC client so the factory-reset action calls the
 * `resetApp` method. A real component (not the `detailFor` factory) so it can
 * call the `useIpcClient` hook.
 */
const DataPageConnected = (): ReactElement => {
  const client = useIpcClient()
  const { notify } = useNotifications()
  return (
    <DataPage
      onReset={() => {
        // On success the app relaunches, so only the failure path needs a toast.
        void client.resetApp(undefined).then((r) => {
          if (!r.ok)
            notify({
              tone: "error",
              message: "Reset failed. Please try again.",
            })
        })
      }}
    />
  )
}

const detailFor = (section: string): ReactNode => {
  switch (section) {
    case "providers":
      return <ProvidersPage />
    case "models":
      return <ModelsPage />
    case "harnesses":
      return <HarnessesPage />
    case "data":
      return <DataPageConnected />
    default:
      return <GeneralPage />
  }
}

/**
 * Settings master/detail factory: `SettingsNav` (sections) as master, the
 * matching page as detail (wrapped in an `ErrorBoundary` keyed by section so a
 * crashing page resets when you navigate away). Pages own their own hooks.
 */
export const SettingsView = ({
  section,
  onSection,
}: {
  readonly section: string
  readonly onSection: (key: string) => void
}): { readonly master: ReactNode; readonly detail: ReactNode } => ({
  master: (
    <SettingsNav sections={SECTIONS} active={section} onSelect={onSection} />
  ),
  detail: <ErrorBoundary key={section}>{detailFor(section)}</ErrorBoundary>,
})
