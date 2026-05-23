import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { App } from "./app"
import { createFakeIpcClient } from "./test/fake-client"

const fullClient = () =>
  createFakeIpcClient({
    getProviders: async () => ({ ok: true, value: [] }),
    getAliases: async () => ({ ok: true, value: [] }),
    getHarnesses: async () => ({ ok: true, value: [] }),
    getSessions: async () => ({ ok: true, value: [] }),
    getProxyStatus: async () => ({
      ok: true,
      value: { running: false, port: 0 },
    }),
  })

describe("App", () => {
  it("renders the dashboard route by default", async () => {
    render(<App client={fullClient()} initialRoute="dashboard" />)
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument(),
    )
  })

  it("navigates to the providers page when its nav item is clicked", async () => {
    render(<App client={fullClient()} initialRoute="dashboard" />)
    fireEvent.click(screen.getByRole("link", { name: "Providers" }))
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Providers" }),
      ).toBeInTheDocument(),
    )
  })

  it("renders the routing page when the initial route is routing", async () => {
    render(<App client={fullClient()} initialRoute="routing" />)
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Routing" }),
      ).toBeInTheDocument(),
    )
  })

  it("falls back to the dashboard when given an unknown initial route", async () => {
    render(<App client={fullClient()} initialRoute="bogus" />)
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument(),
    )
  })
})
