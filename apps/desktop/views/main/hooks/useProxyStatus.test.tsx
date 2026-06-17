import { describe, expect, it } from "bun:test"
import { screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { useProxyStatus } from "./useProxyStatus"

const Probe = ({ pollMs }: { pollMs?: number }): ReactElement => {
  const { data, loading } = useProxyStatus(pollMs)
  return (
    <div>
      <span>{loading ? "loading" : "idle"}</span>
      <span>{data === undefined ? "no-data" : `port:${data.port}`}</span>
      <span>{data?.running ? "running" : "not-running"}</span>
    </div>
  )
}

describe("useProxyStatus", () => {
  it("exposes proxy status once the call resolves", async () => {
    const client = createFakeIpcClient({
      getProxyStatus: async () => ({
        ok: true,
        value: { running: true, port: 4000 },
      }),
    })
    renderWithProviders(<Probe />, client)
    await waitFor(() =>
      expect(screen.getByText("port:4000")).toBeInTheDocument(),
    )
  })

  it("re-polls until the proxy reports running (the proxy binds asynchronously after the webview mounts)", async () => {
    // First poll lands before the proxy has finished binding → not running.
    // A later poll, once the loopback server is up, must flip the dot to running
    // WITHOUT a manual refetch or an app restart.
    let calls = 0
    const client = createFakeIpcClient({
      getProxyStatus: async () => {
        calls += 1
        return {
          ok: true,
          value: { running: calls > 1, port: 4000 },
        }
      },
    })
    renderWithProviders(<Probe pollMs={20} />, client)
    await waitFor(() =>
      expect(screen.getByText("not-running")).toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByText("running")).toBeInTheDocument())
  })
})
