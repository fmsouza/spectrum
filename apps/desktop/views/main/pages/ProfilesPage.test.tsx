import { describe, expect, it } from "bun:test"
import type { Profile } from "@launchkit/types"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { ProfilesPage } from "./ProfilesPage"

const profile: Profile = {
  id: "pr_1" as Profile["id"],
  name: "Work",
  harnessId: "claude" as Profile["harnessId"],
  env: {},
}
const harness = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {},
  builtIn: true,
}
const model = { id: "m_1", providerId: "p_openai", providerModel: "gpt-4o" }
const baseStubs = {
  getProfiles: async () => ({ ok: true as const, value: [profile] }),
  getHarnesses: async () => ({ ok: true as const, value: [harness] }),
  getModels: async () => ({ ok: true as const, value: [model] }),
  getProviders: async () => ({ ok: true as const, value: [] }),
}

describe("ProfilesPage", () => {
  it("lists profiles from getProfiles", async () => {
    const client = createFakeIpcClient(baseStubs)
    renderWithProviders(<ProfilesPage />, client)
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument())
  })

  it("opens the ProfileForm in a Modal on add and calls addProfile on submit", async () => {
    const client = createFakeIpcClient({
      ...baseStubs,
      getProfiles: async () => ({ ok: true as const, value: [] }),
      addProfile: async () => ({ ok: true as const, value: profile }),
    })
    renderWithProviders(<ProfilesPage />, client)
    // ProfileList's onAdd opens the modal containing ProfileForm.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add profile/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }))
    // ProfileForm (Phase 6 / U.10) renders a Name TextInput + a "Save" button.
    await waitFor(() =>
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "New" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save|create/i }))
    await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
  })
})
