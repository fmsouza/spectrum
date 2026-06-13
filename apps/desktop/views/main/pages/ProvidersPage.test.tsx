import { describe, expect, it } from "bun:test"
import type { ProviderView } from "@spectrum/ipc"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { ProvidersPage } from "./ProvidersPage"

const view: ProviderView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
} as unknown as ProviderView

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getProviders: async () => ({ ok: true, value: [view] }),
    ...stubs,
  })
  renderWithProviders(<ProvidersPage />, client)
  return client
}

describe("ProvidersPage", () => {
  it("renders a table once providers load (consistent with Models page)", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    expect(document.querySelector("table")).not.toBeNull()
  })

  it("shows the provider name, SDK badge, and Set badge in the table row", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    // Provider name cell
    expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument()
    // SDK badge — info tone
    const infoBadge = document.querySelector("span[data-tone='info']")
    expect(infoBadge?.textContent).toBe("openai")
    // secretSet = true → "Set" badge
    const successBadge = document.querySelector("span[data-tone='success']")
    expect(successBadge?.textContent).toBe("Set")
  })

  it("renders the Set secret button inside lk-cell-actions in the provider's row", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    const row = document.querySelector("tbody tr") as HTMLElement
    const actionsCell = row.querySelector("td.lk-cell-actions")
    expect(actionsCell).not.toBeNull()
    expect(
      within(actionsCell as HTMLElement).getByRole("button", {
        name: /set secret/i,
      }),
    ).toBeInTheDocument()
  })

  it("does NOT render a separate 'Provider secrets' list", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    const secretsList = document.querySelector(
      "ul[aria-label='Provider secrets']",
    )
    expect(secretsList).toBeNull()
  })

  it("does NOT render an article or the old lk-list-row--card style", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    expect(document.querySelector("article")).toBeNull()
    expect(document.querySelector(".lk-list-row--card")).toBeNull()
  })

  it("wraps the add-provider form action buttons in lk-form-actions row", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))
    const actionsRow = document.querySelector(".lk-row.lk-form-actions")
    expect(actionsRow).not.toBeNull()
    // buttons must NOT be direct children of the form
    const form = document.querySelector("form[aria-label='Add provider']")
    const directButtons = Array.from(form?.children ?? []).filter(
      (c) => c.tagName === "BUTTON",
    )
    expect(directButtons.length).toBe(0)
  })

  it("wraps the set-secret form action buttons in lk-form-actions row", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    // Trigger the set-secret form from the table row
    const row = document.querySelector("tbody tr") as HTMLElement
    const actionsCell = row.querySelector("td.lk-cell-actions") as HTMLElement
    fireEvent.click(
      within(actionsCell).getByRole("button", { name: /set secret/i }),
    )
    const secretForm = document.querySelector(
      "form[aria-label='Set secret for OpenAI']",
    )
    expect(secretForm).not.toBeNull()
    const actionsRow = secretForm?.querySelector(".lk-row.lk-form-actions")
    expect(actionsRow).not.toBeNull()
    // buttons must NOT be direct children of the form
    const directButtons = Array.from(secretForm?.children ?? []).filter(
      (c) => c.tagName === "BUTTON",
    )
    expect(directButtons.length).toBe(0)
  })

  it("calls setProviderSecret with the typed value when the secret form is submitted", async () => {
    const client = renderPage({
      setProviderSecret: async () => ({ ok: true, value: null }),
    })
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )

    // Open via table row's Set secret button
    const row = document.querySelector("tbody tr") as HTMLElement
    const actionsCell = row.querySelector("td.lk-cell-actions") as HTMLElement
    fireEvent.click(
      within(actionsCell).getByRole("button", { name: /set secret/i }),
    )
    fireEvent.change(screen.getByLabelText("Secret field"), {
      target: { value: "apiKey" },
    })
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "sk-secret-123" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save secret/i }))

    await waitFor(() => expect(client.calls.setProviderSecret.length).toBe(1))
    expect(client.calls.setProviderSecret[0]).toEqual({
      providerId: "p_openai",
      field: "apiKey",
      value: "sk-secret-123",
    })
  })

  it("never re-displays the secret value after submitting it", async () => {
    const client = renderPage({
      setProviderSecret: async () => ({ ok: true, value: null }),
    })
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )

    const row = document.querySelector("tbody tr") as HTMLElement
    const actionsCell = row.querySelector("td.lk-cell-actions") as HTMLElement
    fireEvent.click(
      within(actionsCell).getByRole("button", { name: /set secret/i }),
    )
    fireEvent.change(screen.getByLabelText("Secret field"), {
      target: { value: "apiKey" },
    })
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "sk-secret-123" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save secret/i }))

    await waitFor(() => expect(client.calls.setProviderSecret.length).toBe(1))
    // The write-only form clears and the value is not echoed anywhere.
    expect(screen.queryByDisplayValue("sk-secret-123")).toBeNull()
  })

  it("renders the add-provider form inside a modal dialog", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))

    const dialog = await screen.findByRole("dialog", { name: /add provider/i })
    expect(
      dialog.querySelector("form[aria-label='Add provider']"),
    ).not.toBeNull()
  })

  it("closes the add-provider modal when Cancel is clicked", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))
    await screen.findByRole("dialog", { name: /add provider/i })
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(screen.queryByRole("dialog", { name: /add provider/i })).toBeNull()
  })

  it("submits the add-provider form with non-secret config and secret field names only", async () => {
    const client = renderPage({
      addProvider: async () => ({ ok: true, value: view }),
    })
    await waitFor(() =>
      expect(screen.getByRole("cell", { name: "OpenAI" })).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))
    fireEvent.change(screen.getByLabelText("Provider name"), {
      target: { value: "Groq" },
    })
    fireEvent.change(screen.getByLabelText("SDK provider"), {
      target: { value: "groq" },
    })
    fireEvent.click(screen.getByRole("button", { name: /create provider/i }))

    await waitFor(() => expect(client.calls.addProvider.length).toBe(1))
    const params = client.calls.addProvider[0]
    expect(params).toMatchObject({ name: "Groq", sdkProvider: "groq" })
    // No raw secret ever travels with an add.
    expect(params).not.toHaveProperty("secrets")
  })
})
