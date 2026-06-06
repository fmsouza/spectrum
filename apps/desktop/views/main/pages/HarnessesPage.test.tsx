import { describe, expect, it } from "bun:test"
import type { HarnessDefinition } from "@launchkit/types"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { HarnessesPage } from "./HarnessesPage"

const builtIn = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  builtIn: true,
} as unknown as HarnessDefinition
const custom = {
  id: "mytool",
  name: "My Tool",
  command: "mytool",
  apiFormat: "openai",
  envTemplate: { OPENAI_BASE_URL: "{{proxyUrl}}" },
  builtIn: false,
} as unknown as HarnessDefinition

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getHarnesses: async () => ({ ok: true, value: [builtIn, custom] }),
    ...stubs,
  })
  renderWithProviders(<HarnessesPage />, client)
  return client
}

describe("HarnessesPage", () => {
  it("renders built-in and custom lists with lk-list/lk-list-row/lk-list-row__label hooks", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )
    const lists = document.querySelectorAll("ul.lk-list")
    expect(lists.length).toBe(2)
    const rows = document.querySelectorAll("li.lk-list-row")
    expect(rows.length).toBeGreaterThan(0)
    const labels = document.querySelectorAll(".lk-list-row__label")
    expect(labels.length).toBeGreaterThan(0)
  })

  it("lists built-in and custom harnesses under separate sections when loaded", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )
    expect(
      screen.getByRole("heading", { name: /built-in/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /custom/i })).toBeInTheDocument()
    expect(screen.getByText("My Tool")).toBeInTheDocument()
  })

  it("calls addHarness with the form values when a custom harness is added", async () => {
    const client = renderPage({
      addHarness: async (p) => ({ ok: true, value: p }),
    })
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole("button", { name: /add custom harness/i }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Codex" },
    })
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "codex" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(client.calls.addHarness.length).toBe(1))
    expect(client.calls.addHarness[0]).toMatchObject({
      name: "Codex",
      command: "codex",
      apiFormat: "anthropic",
      builtIn: false,
    })
  })

  it("renders the harness form inside a modal dialog", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole("button", { name: /add custom harness/i }))

    expect(
      await screen.findByRole("dialog", { name: /add custom harness/i }),
    ).toBeInTheDocument()
  })

  it("closes the harness modal when Cancel is clicked", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole("button", { name: /add custom harness/i }))
    await screen.findByRole("dialog", { name: /add custom harness/i })
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(
      screen.queryByRole("dialog", { name: /add custom harness/i }),
    ).toBeNull()
  })

  it("does not offer a delete control for a built-in harness", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole("button", { name: "Delete Claude Code" }),
    ).toBeNull()
  })

  it("calls deleteHarness with the id when a custom harness is deleted", async () => {
    const client = renderPage({
      deleteHarness: async () => ({ ok: true, value: null }),
    })
    await waitFor(() => expect(screen.getByText("My Tool")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Delete My Tool" }))
    await waitFor(() => expect(client.calls.deleteHarness.length).toBe(1))
    expect(client.calls.deleteHarness[0]).toEqual({ id: "mytool" })
  })

  it("renders the Add custom harness button at the top of the page body, before the built-in section", async () => {
    renderPage({})
    await waitFor(() =>
      expect(screen.getByText("Claude Code")).toBeInTheDocument(),
    )
    const button = screen.getByRole("button", { name: /add custom harness/i })
    const body = document.querySelector(".lk-page__body")
    expect(button.parentElement).toBe(body)
    const builtIn = document.querySelector(
      "section[aria-label='Built-in harnesses']",
    )
    expect(
      button.compareDocumentPosition(builtIn as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
