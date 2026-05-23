import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { HarnessesPage } from "./HarnessesPage"
import type { HarnessDefinition } from "@launchkit/types"

const builtIn = {
  id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" }, defaultAlias: "default", builtIn: true,
} as unknown as HarnessDefinition
const custom = {
  id: "mytool", name: "My Tool", command: "mytool", apiFormat: "openai",
  envTemplate: { OPENAI_BASE_URL: "{{proxyUrl}}" }, defaultAlias: "fast", builtIn: false,
} as unknown as HarnessDefinition

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getHarnesses: async () => ({ ok: true, value: [builtIn, custom] }),
    ...stubs,
  })
  render(<IpcClientProvider client={client}><HarnessesPage /></IpcClientProvider>)
  return client
}

describe("HarnessesPage", () => {
  it("lists built-in and custom harnesses under separate sections when loaded", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())
    expect(screen.getByRole("heading", { name: /built-in/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /custom/i })).toBeInTheDocument()
    expect(screen.getByText("My Tool")).toBeInTheDocument()
  })

  it("calls addHarness with the form values when a custom harness is added", async () => {
    const client = renderPage({ addHarness: async (p) => ({ ok: true, value: p }) })
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add custom harness/i }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Codex" } })
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "codex" } })
    fireEvent.change(screen.getByLabelText("Default alias"), { target: { value: "default" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(client.calls.addHarness.length).toBe(1))
    expect(client.calls.addHarness[0]).toMatchObject({
      name: "Codex",
      command: "codex",
      apiFormat: "anthropic",
      defaultAlias: "default",
      builtIn: false,
    })
  })

  it("does not offer a delete control for a built-in harness", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: "Delete Claude Code" })).toBeNull()
  })

  it("calls deleteHarness with the id when a custom harness is deleted", async () => {
    const client = renderPage({ deleteHarness: async () => ({ ok: true, value: null }) })
    await waitFor(() => expect(screen.getByText("My Tool")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Delete My Tool" }))
    await waitFor(() => expect(client.calls.deleteHarness.length).toBe(1))
    expect(client.calls.deleteHarness[0]).toEqual({ id: "mytool" })
  })
})
