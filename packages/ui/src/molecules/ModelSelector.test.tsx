import { describe, expect, it } from "bun:test"
import type { ModelRoute } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ModelSelector } from "./ModelSelector"

const models = [
  { id: "mdl_default", providerId: "p1", providerModel: "sonnet" },
  { id: "mdl_fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelRoute[]

const providerNames: Readonly<Record<string, string>> = { p1: "Anthropic" }

describe("ModelSelector", () => {
  it("renders 'default' as the pill label when model is empty", () => {
    render(
      <ModelSelector
        model=""
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: /default/i })).toBeInTheDocument()
    cleanup()
  })

  it("renders the current model's provider/model label on the pill", () => {
    render(
      <ModelSelector
        model="mdl_fast"
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole("button", { name: /Anthropic \/ haiku/i }),
    ).toBeInTheDocument()
    cleanup()
  })

  it("falls back to the raw model id when the route is missing", () => {
    render(
      <ModelSelector
        model="mdl_unknown"
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole("button", { name: "mdl_unknown" }),
    ).toBeInTheDocument()
    cleanup()
  })

  it("falls back to the providerId when providerNames has no entry for it", () => {
    render(
      <ModelSelector model="mdl_fast" models={models} onChange={() => {}} />,
    )
    expect(
      screen.getByRole("button", { name: /p1 \/ haiku/i }),
    ).toBeInTheDocument()
    cleanup()
  })

  it("lists every model plus 'default' in the menu", () => {
    render(
      <ModelSelector
        model=""
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /default/i }))
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3) // default + 2 models
    cleanup()
  })

  it("picking a model calls onChange with its id", () => {
    let picked: string | undefined
    render(
      <ModelSelector
        model=""
        models={models}
        providerNames={providerNames}
        onChange={(m) => {
          picked = m
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /default/i }))
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Anthropic \/ haiku/i }),
    )
    expect(picked).toBe("mdl_fast")
    expect(screen.queryByRole("menu")).toBeNull()
    cleanup()
  })

  it("picking 'default' calls onChange with the empty string", () => {
    let picked: string | undefined = "init"
    render(
      <ModelSelector
        model="mdl_fast"
        models={models}
        providerNames={providerNames}
        onChange={(m) => {
          picked = m
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Anthropic \/ haiku/i }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /default/i }))
    expect(picked).toBe("")
    cleanup()
  })

  it("marks the current model checked in the menu", () => {
    render(
      <ModelSelector
        model="mdl_fast"
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Anthropic \/ haiku/i }))
    expect(
      screen.getByRole("menuitemradio", { name: /Anthropic \/ haiku/i }),
    ).toHaveAttribute("aria-checked", "true")
    cleanup()
  })

  it("closes on Escape without changing the model", () => {
    let calls = 0
    render(
      <ModelSelector
        model=""
        models={models}
        providerNames={providerNames}
        onChange={() => {
          calls += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /default/i }))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(calls).toBe(0)
    cleanup()
  })

  it("disables the pill when disabled", () => {
    render(
      <ModelSelector
        model=""
        models={models}
        providerNames={providerNames}
        onChange={() => {}}
        disabled
      />,
    )
    expect(screen.getByRole("button", { name: /default/i })).toBeDisabled()
    cleanup()
  })
})
