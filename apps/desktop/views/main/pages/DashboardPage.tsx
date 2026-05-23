import type { HarnessId } from "@launchkit/types"
import {
  Button,
  EmptyState,
  SessionTable,
  SettingsLayout,
  Spinner,
  StatusDot,
} from "@launchkit/ui"
import type { ReactElement } from "react"
import { useIpcClient } from "../IpcClientContext"
import { useHarnesses } from "../hooks/useHarnesses"
import { useProxyStatus } from "../hooks/useProxyStatus"
import { useSessions } from "../hooks/useSessions"

export const DashboardPage = (): ReactElement => {
  const client = useIpcClient()
  const proxy = useProxyStatus()
  const harnesses = useHarnesses()
  const sessions = useSessions()

  const active = (sessions.data ?? []).filter((s) => s.endedAt === undefined)

  const launch = async (id: string): Promise<void> => {
    const r = await client.launchHarness({ id: id as HarnessId })
    if (r.ok) sessions.refetch()
  }

  return (
    <SettingsLayout title="Dashboard">
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

      <section aria-label="Quick launch">
        <h2>Quick launch</h2>
        {harnesses.loading ? <Spinner label="Loading harnesses" /> : null}
        <ul>
          {(harnesses.data ?? []).map((h) => (
            <li key={h.id}>
              <span>{h.name}</span>
              <Button
                onClick={() => void launch(h.id)}
              >{`Launch ${h.name}`}</Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Active sessions">
        <h2>Active sessions</h2>
        {active.length === 0 ? (
          <EmptyState
            title="No active sessions"
            hint="Launch a harness to get started."
          />
        ) : (
          <SessionTable sessions={active} maxVisible={10} />
        )}
      </section>
    </SettingsLayout>
  )
}
