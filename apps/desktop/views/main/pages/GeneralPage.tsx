import { SettingsLayout, Spinner, StatusDot } from "@launchkit/ui"
import type { ReactElement } from "react"
import { useProxyStatus } from "../hooks/useProxyStatus"

/**
 * The General settings section. Ships proxy status only this round — config
 * import/export is deferred and stays reachable via the tray menu (no new IPC).
 */
export const GeneralPage = (): ReactElement => {
  const proxy = useProxyStatus()

  return (
    <SettingsLayout title="General">
      <div aria-label="Proxy status">
        {proxy.data === undefined ? (
          <Spinner label="Checking proxy" />
        ) : (
          <StatusDot
            status={proxy.data.running ? "on" : "off"}
            label={
              proxy.data.running
                ? `Proxy running on port ${proxy.data.port}`
                : "Proxy stopped"
            }
          />
        )}
      </div>
    </SettingsLayout>
  )
}
