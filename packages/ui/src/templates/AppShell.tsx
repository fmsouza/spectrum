import type { ReactElement, ReactNode } from "react"
import { StatusDot } from "../atoms/StatusDot"
import { RailItem } from "../molecules/RailItem"

export type AppMode = "sessions" | "settings"

export type AppShellProps = {
  readonly mode: AppMode
  readonly onModeChange: (mode: AppMode) => void
  readonly proxyRunning: boolean
  readonly master: ReactNode
  readonly detail: ReactNode
}

export const AppShell = ({
  mode,
  onModeChange,
  proxyRunning,
  master,
  detail,
}: AppShellProps): ReactElement => (
  <div>
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
          <span aria-hidden="true">▦</span>
        </RailItem>
        <RailItem
          label="Settings"
          active={mode === "settings"}
          onClick={() => onModeChange("settings")}
        >
          <span aria-hidden="true">⚙</span>
        </RailItem>
      </ul>
      <StatusDot
        status={proxyRunning ? "on" : "off"}
        label={proxyRunning ? "proxy running" : "proxy stopped"}
      />
    </nav>
    <nav aria-label={mode === "sessions" ? "Sessions" : "Settings"}>
      {master}
    </nav>
    <main>{detail}</main>
  </div>
)
