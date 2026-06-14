import { describe, expect, it } from "bun:test"
import { ok } from "@spectrum/utils"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { GeneralPage } from "./GeneralPage"

const upToDate = {
  phase: "up-to-date" as const,
  currentVersion: "1.0.0",
  latestVersion: null,
  available: false,
  progress: 0,
  error: null,
  channel: "stable" as const,
  showBanner: false,
}

describe("GeneralPage updates section", () => {
  it("shows the current version", async () => {
    renderWithProviders(
      <GeneralPage />,
      createFakeIpcClient({
        checkForUpdate: async () => ok(upToDate),
        getUpdateState: async () => ok(upToDate),
      }),
    )
    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeTruthy())
  })

  it("switches channel when the canary toggle is chosen", async () => {
    let chosen: string | null = null
    renderWithProviders(
      <GeneralPage />,
      createFakeIpcClient({
        checkForUpdate: async () => ok(upToDate),
        getUpdateState: async () => ok(upToDate),
        setUpdateChannel: async ({ channel }) => {
          chosen = channel
          return ok({ ...upToDate, channel })
        },
      }),
    )
    await waitFor(() => screen.getByLabelText(/canary/i))
    fireEvent.click(screen.getByLabelText(/canary/i))
    await waitFor(() => expect(chosen).toBe("canary"))
  })
})
