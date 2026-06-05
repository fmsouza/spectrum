import { describe, expect, it } from "bun:test"
import { screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { useProxyStatus } from "./useProxyStatus"

const Probe = (): ReactElement => {
  const { data, loading } = useProxyStatus()
  return (
    <div>
      <span>{loading ? "loading" : "idle"}</span>
      <span>{data === undefined ? "no-data" : `port:${data.port}`}</span>
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
})
