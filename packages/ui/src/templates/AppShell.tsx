import type { ReactElement, ReactNode } from "react"
import { Icon } from "../atoms/Icon"
import { StatusDot } from "../atoms/StatusDot"
import { Tooltip } from "../atoms/Tooltip"
import { RailItem } from "../molecules/RailItem"

export type AppMode = "sessions" | "settings"

export type AppShellProps = {
  readonly mode: AppMode
  readonly onModeChange: (mode: AppMode) => void
  readonly proxyRunning: boolean
  readonly proxyPort?: number | undefined
  readonly master: ReactNode
  readonly detail: ReactNode
}

export const AppShell = ({
  mode,
  onModeChange,
  proxyRunning,
  proxyPort,
  master,
  detail,
}: AppShellProps): ReactElement => {
  const proxyLabel = proxyRunning
    ? `Proxy running on port ${proxyPort ?? "?"}`
    : "Proxy stopped"
  return (
    <div className="lk-shell">
      <nav aria-label="Primary">
        <span aria-hidden="true" data-app-icon="">
          LK
        </span>
        <ul>
          <RailItem
            label="Sessions"
            active={mode === "sessions"}
            onClick={() => onModeChange("sessions")}
          >
            <Icon name="sessions" />
          </RailItem>
          <RailItem
            label="Settings"
            active={mode === "settings"}
            onClick={() => onModeChange("settings")}
          >
            <Icon name="settings" />
          </RailItem>
        </ul>
        <Tooltip label={proxyLabel}>
          <StatusDot status={proxyRunning ? "on" : "off"} label={proxyLabel} />
        </Tooltip>
      </nav>
      <nav aria-label={mode === "sessions" ? "Sessions" : "Settings"}>
        {master}
      </nav>
      <main>{detail}</main>
    </div>
  )
}
