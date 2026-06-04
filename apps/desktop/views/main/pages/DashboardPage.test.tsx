import { describe, expect, it } from "bun:test"
import type { HarnessDefinition, Session } from "@launchkit/types"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { DashboardPage, type DashboardPageProps } from "./DashboardPage"

const activeSession = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-05-23T10:00:00.000Z",
} as unknown as Session
const harness = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {},
  defaultAlias: "default",
  builtIn: true,
} as unknown as HarnessDefinition

const renderPage = (
  stubs: Parameters<typeof createFakeIpcClient>[0],
  onLaunched?: DashboardPageProps["onLaunched"],
) => {
  const client = createFakeIpcClient({
    getSessions: async () => ({ ok: true, value: [activeSession] }),
    getHarnesses: async () => ({ ok: true, value: [harness] }),
    getProxyStatus: async () => ({
      ok: true,
      value: { running: true, port: 4000 },
    }),
    ...stubs,
  })
  render(
    <IpcClientProvider client={client}>
      <DashboardPage onLaunched={onLaunched} />
    </IpcClientProvider>,
  )
  return client
}

describe("DashboardPage", () => {
  it("shows the proxy running status when the status loads", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByLabelText(/proxy running/i)).toBeInTheDocument(),
    )
  })

  it("renders the active session when one is running", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("running")).toBeInTheDocument())
  })

  it("calls launchHarness with the harness id when a quick-launch card is clicked", async () => {
    const client = renderPage({
      launchHarness: async () => ({
        ok: true,
        value: { sessionId: activeSession.id },
      }),
    })
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /launch claude code/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /launch claude code/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    expect(client.calls.launchHarness[0]).toEqual({ id: "claude" })
  })

  it("invokes onLaunched with the new session id and harness after launch", async () => {
    const launched: Array<{ session: string; harness: string }> = []
    renderPage(
      {
        launchHarness: async () => ({
          ok: true,
          value: { sessionId: activeSession.id },
        }),
      },
      (session, harness) => launched.push({ session, harness }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /launch claude code/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /launch claude code/i }))
    await waitFor(() => expect(launched.length).toBe(1))
    expect(launched[0]).toEqual({
      session: activeSession.id,
      harness: "claude",
    })
  })
})
