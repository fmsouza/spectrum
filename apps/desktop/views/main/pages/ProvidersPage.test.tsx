import { describe, expect, it } from "bun:test"
import type { ProviderView } from "@launchkit/ipc"
import { fireEvent, screen, waitFor } from "@testing-library/react"
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
  it("renders the provider-secrets list with lk-list/lk-list-row/lk-list-row__label hooks", async () => {
    renderPage({})
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
    )
    const list = document.querySelector("ul.lk-list")
    expect(list).not.toBeNull()
    const row = document.querySelector("li.lk-list-row")
    expect(row).not.toBeNull()
    const label = document.querySelector(".lk-list-row__label")
    expect(label).not.toBeNull()
  })

  it("wraps the add-provider form action buttons in lk-form-actions row", async () => {
    renderPage({})
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
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

  it("renders the provider name once the providers load", async () => {
    renderPage({})
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
    )
  })

  it("shows the secret field as set without rendering any secret value", async () => {
    renderPage({})
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
    )
    // Presence flag is shown...
    expect(screen.getByText(/apiKey/i)).toBeInTheDocument()
    expect(screen.getByText("apiKey: set")).toBeInTheDocument()
    // ...and no secret value is anywhere in the DOM (the view never carries one).
    expect(document.body.textContent).not.toContain("sk-")
  })

  it("calls setProviderSecret with the typed value when the secret form is submitted", async () => {
    const client = renderPage({
      setProviderSecret: async () => ({ ok: true, value: null }),
    })
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Set secret for OpenAI" }),
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
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Set secret for OpenAI" }),
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

  it("submits the add-provider form with non-secret config and secret field names only", async () => {
    const client = renderPage({
      addProvider: async () => ({ ok: true, value: view }),
    })
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument(),
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
