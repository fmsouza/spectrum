import { describe, expect, it } from "bun:test"
import type { ProviderView } from "@launchkit/ipc"
import type { ModelAlias } from "@launchkit/types"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { RoutingPage } from "./RoutingPage"

const alias = {
  alias: "fast",
  providerId: "p_openai",
  providerModel: "gpt-4o-mini",
} as unknown as ModelAlias
const view = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: {},
  secretFields: {},
  models: ["gpt-4o-mini"],
} as unknown as ProviderView

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getAliases: async () => ({ ok: true, value: [alias] }),
    getProviders: async () => ({ ok: true, value: [view] }),
    // Default: return empty models (no discovery) so existing tests don't break.
    listProviderModels: async () => ({ ok: true, value: { models: [] } }),
    ...stubs,
  })
  render(
    <IpcClientProvider client={client}>
      <RoutingPage />
    </IpcClientProvider>,
  )
  return client
}

describe("RoutingPage", () => {
  it("renders each alias with its resolved provider name when loaded", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())
    expect(screen.getByText("OpenAI")).toBeInTheDocument()
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument()
  })

  it("calls addAlias with the new mapping when the add form is submitted", async () => {
    // Provider discovery returns empty so the Model field stays a TextInput.
    const client = renderPage({
      addAlias: async (p) => ({ ok: true, value: p }),
      listProviderModels: async () => ({ ok: true, value: { models: [] } }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Alias name"), {
      target: { value: "smart" },
    })
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })
    // Wait for listProviderModels to complete (even though it returns empty → TextInput stays).
    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-4o" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }))

    await waitFor(() => expect(client.calls.addAlias.length).toBe(1))
    expect(client.calls.addAlias[0]).toEqual({
      alias: "smart",
      providerId: "p_openai",
      providerModel: "gpt-4o",
    })
  })

  it("calls deleteAlias with the alias name when a row is deleted", async () => {
    const client = renderPage({
      deleteAlias: async () => ({ ok: true, value: null }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(client.calls.deleteAlias.length).toBe(1))
    expect(client.calls.deleteAlias[0]).toEqual({ alias: "fast" })
  })

  it("seeds the edit form and calls updateAlias when an existing alias is edited", async () => {
    const client = renderPage({
      updateAlias: async () => ({ ok: true, value: alias }),
      // Discovery returns empty so the edit form keeps a text input.
      listProviderModels: async () => ({ ok: true, value: { models: [] } }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /edit/i }))
    // Wait for listProviderModels to settle (even empty → TextInput).
    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toHaveValue("gpt-4o-mini"),
    )
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-4o" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }))

    await waitFor(() => expect(client.calls.updateAlias.length).toBe(1))
    expect(client.calls.updateAlias[0]).toEqual({
      alias: "fast",
      input: { providerId: "p_openai", providerModel: "gpt-4o" },
    })
  })

  // ── Model discovery tests ──────────────────────────────────────────────────

  it("calls listProviderModels when a provider is selected in the add-alias form", async () => {
    const client = renderPage({
      addAlias: async (p) => ({ ok: true, value: p }),
      listProviderModels: async () => ({
        ok: true,
        value: { models: ["gpt-4o", "gpt-4o-mini"] },
      }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })

    await waitFor(() =>
      expect(client.calls.listProviderModels.length).toBeGreaterThan(0),
    )
    expect(client.calls.listProviderModels[0]).toEqual({
      providerId: "p_openai",
    })
  })

  it("renders a Model <Select> with discovered models when listProviderModels returns a non-empty list", async () => {
    renderPage({
      listProviderModels: async () => ({
        ok: true,
        value: { models: ["gpt-4o", "gpt-4o-mini"] },
      }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })

    // Wait for the discovered-model select to appear with options.
    await waitFor(() => {
      const el = screen.getByLabelText("Model") as HTMLSelectElement
      expect(el.tagName).toBe("SELECT")
      // The select has the discovered model options.
      const values = Array.from(el.options).map((o) => o.value)
      expect(values).toContain("gpt-4o")
      expect(values).toContain("gpt-4o-mini")
    })
  })

  it("falls back to a TextInput with a note when listProviderModels returns an empty list", async () => {
    renderPage({
      listProviderModels: async () => ({ ok: true, value: { models: [] } }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })

    await waitFor(() => {
      const el = screen.getByLabelText("Model")
      expect(el.tagName).toBe("INPUT")
    })
    expect(screen.getByText(/couldn't list models/i)).toBeInTheDocument()
  })

  it("falls back to a TextInput with a note when listProviderModels errors (unsupported SDK)", async () => {
    renderPage({
      listProviderModels: async () => ({
        ok: false,
        error: { kind: "handler-failed", detail: "unsupported" },
      }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })

    await waitFor(() => {
      const el = screen.getByLabelText("Model")
      expect(el.tagName).toBe("INPUT")
    })
    expect(screen.getByText(/couldn't list models/i)).toBeInTheDocument()
  })

  it("creating an alias with a model picked from the Select calls addAlias with that model", async () => {
    const client = renderPage({
      addAlias: async (p) => ({ ok: true, value: p }),
      listProviderModels: async () => ({
        ok: true,
        value: { models: ["gpt-4o", "gpt-4o-mini"] },
      }),
    })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Alias name"), {
      target: { value: "smart" },
    })
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })

    // Wait for discovered-model Select to appear, then pick a model.
    await waitFor(() => {
      const el = screen.getByLabelText("Model")
      expect(el.tagName).toBe("SELECT")
    })
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-4o" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }))

    await waitFor(() => expect(client.calls.addAlias.length).toBe(1))
    expect(client.calls.addAlias[0]).toEqual({
      alias: "smart",
      providerId: "p_openai",
      providerModel: "gpt-4o",
    })
  })

  it("clears providerModel when the provider changes", async () => {
    const ollamaView = {
      id: "p_ollama",
      name: "Ollama",
      sdkProvider: "ollama",
      config: {},
      secretFields: {},
      models: [],
    } as unknown as ProviderView
    const client = createFakeIpcClient({
      getAliases: async () => ({ ok: true, value: [] }),
      getProviders: async () => ({ ok: true, value: [view, ollamaView] }),
      listProviderModels: async ({ providerId }) => ({
        ok: true,
        value: {
          models: providerId === "p_openai" ? ["gpt-4o"] : ["llama3"],
        },
      }),
    })
    render(
      <IpcClientProvider client={client}>
        <RoutingPage />
      </IpcClientProvider>,
    )
    // Wait for page to load.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add alias/i }),
      ).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))

    // Pick OpenAI, wait for models, pick gpt-4o.
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_openai" },
    })
    await waitFor(() => {
      const el = screen.getByLabelText("Model")
      expect(el.tagName).toBe("SELECT")
    })
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-4o" },
    })
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe(
      "gpt-4o",
    )

    // Now switch to Ollama — providerModel should be cleared.
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "p_ollama" },
    })
    await waitFor(() => {
      // model field should have been cleared (value = "")
      expect(
        (screen.getByLabelText("Model") as HTMLInputElement | HTMLSelectElement)
          .value,
      ).toBe("")
    })
  })
})
