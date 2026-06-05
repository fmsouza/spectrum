import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { SettingsView } from "./SettingsView"

const stubs = {
  getProviders: async () => ({ ok: true as const, value: [] }),
  getModels: async () => ({ ok: true as const, value: [] }),
  getHarnesses: async () => ({ ok: true as const, value: [] }),
  getProfiles: async () => ({ ok: true as const, value: [] }),
  getProxyStatus: async () => ({
    ok: true as const,
    value: { running: false, port: 4000 },
  }),
}

describe("SettingsView", () => {
  it("renders SettingsNav as master and the profiles page as detail when section=profiles", () => {
    const client = createFakeIpcClient(stubs)
    const { master, detail } = SettingsView({
      section: "profiles",
      onSection: () => {},
    })
    render(
      <IpcClientProvider client={client}>
        <div>
          {master}
          {detail}
        </div>
      </IpcClientProvider>,
    )
    // SettingsNav (master) shows the Profiles entry as a nav link. Scope to the
    // link role so we don't also match the ProfilesPage detail heading.
    expect(screen.getByRole("link", { name: /profiles/i })).toBeInTheDocument()
  })
})
