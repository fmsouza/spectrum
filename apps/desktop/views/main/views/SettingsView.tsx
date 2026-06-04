import { SettingsNav } from "@launchkit/ui"
import type { ReactNode } from "react"
import { ErrorBoundary } from "../ErrorBoundary"
import {
  GeneralPage,
  HarnessesPage,
  ProfilesPage,
  ProvidersPage,
  RoutingPage,
} from "../pages"

const SECTIONS = [
  { key: "general", label: "General" },
  { key: "providers", label: "Providers" },
  { key: "routing", label: "Routing" },
  { key: "harnesses", label: "Harnesses" },
  { key: "profiles", label: "Profiles" },
] as const

const detailFor = (section: string): ReactNode => {
  switch (section) {
    case "providers":
      return <ProvidersPage />
    case "routing":
      return <RoutingPage />
    case "harnesses":
      return <HarnessesPage />
    case "profiles":
      return <ProfilesPage />
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
