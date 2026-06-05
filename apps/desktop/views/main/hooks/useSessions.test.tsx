import { describe, expect, it } from "bun:test"
import { screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { useSessions } from "./useSessions"

const Probe = (): ReactElement => {
  const { running, recent } = useSessions()
  return <span>{`r:${running.length} e:${recent.length}`}</span>
}

describe("useSessions", () => {
  it("loads running and recent groups on mount", async () => {
    const client = createFakeIpcClient({
      getSessions: async (params) => ({
        ok: true,
        value:
          params?.running === true ? ([{ id: "s_1" }] as never) : ([] as never),
      }),
    })
    renderWithProviders(<Probe />, client)
    await waitFor(() => expect(screen.getByText("r:1 e:0")).toBeInTheDocument())
  })
})
