import { describe, expect, it } from "bun:test"
import { ok } from "@spectrum/utils"
import { screen, waitFor } from "@testing-library/react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { SettingsView } from "./SettingsView"

const stubs = {
  getProviders: async () => ({ ok: true as const, value: [] }),
  getModels: async () => ({ ok: true as const, value: [] }),
  getHarnesses: async () => ({ ok: true as const, value: [] }),
  getProxyStatus: async () => ({
    ok: true as const,
    value: { running: false, port: 4000 },
  }),
}

describe("SettingsView", () => {
  it("renders SettingsNav as master and the harnesses page as detail when section=harnesses", () => {
    const client = createFakeIpcClient(stubs)
    const { master, detail } = SettingsView({
      section: "harnesses",
      onSection: () => {},
    })
    renderWithProviders(
      <div>
        {master}
        {detail}
      </div>,
      client,
    )
    // SettingsNav (master) shows the Harnesses entry as a nav link. Scope to the
    // link role so we don't also match the HarnessesPage detail heading.
    expect(screen.getByRole("link", { name: /harnesses/i })).toBeInTheDocument()
  })

  it("shows the canary version in the nav footer when a canary build is running", async () => {
    const canaryState = {
      phase: "up-to-date" as const,
      currentVersion: "1.6.0-canary.43",
      latestVersion: null,
      latestHash: null,
      available: false,
      progress: 0,
      error: null,
      channel: "canary" as const,
      showBanner: false,
    }
    const client = createFakeIpcClient({
      ...stubs,
      checkForUpdate: async () => ok(canaryState),
      getUpdateState: async () => ok(canaryState),
    })
    const { master } = SettingsView({ section: "general", onSection: () => {} })
    renderWithProviders(<div>{master}</div>, client)
    // useUpdate() runs check() on mount; wait for the store to populate, then the
    // footer text derived from currentVersion · channel appears.
    await waitFor(() =>
      expect(
        screen.getByText(/1\.6\.0-canary\.43 · canary/),
      ).toBeInTheDocument(),
    )
  })

  it("shows the stable version in the nav footer when a stable build is running", async () => {
    const stableState = {
      phase: "up-to-date" as const,
      currentVersion: "1.6.0",
      latestVersion: null,
      latestHash: null,
      available: false,
      progress: 0,
      error: null,
      channel: "stable" as const,
      showBanner: false,
    }
    const client = createFakeIpcClient({
      ...stubs,
      checkForUpdate: async () => ok(stableState),
      getUpdateState: async () => ok(stableState),
    })
    const { master } = SettingsView({ section: "general", onSection: () => {} })
    renderWithProviders(<div>{master}</div>, client)
    await waitFor(() =>
      expect(screen.getByText(/1\.6\.0 · stable/)).toBeInTheDocument(),
    )
  })
})
