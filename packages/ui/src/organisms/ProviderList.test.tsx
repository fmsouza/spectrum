import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ProviderDisplay } from "../molecules/ProviderCard"
import { ProviderList } from "./ProviderList"

const providers: readonly ProviderDisplay[] = [
  { id: "p_openai", name: "OpenAI", sdkProvider: "openai" },
  { id: "p_anthropic", name: "Anthropic", sdkProvider: "anthropic" },
]

describe("ProviderList", () => {
  it("renders rows with the lk-list / lk-list-row hooks", () => {
    const { container } = render(
      <ProviderList
        providers={[{ id: "p1", name: "OpenAI", sdkProvider: "openai" }]}
        onAdd={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(container.querySelector(".lk-list")).not.toBeNull()
    expect(container.querySelector(".lk-list-row")).not.toBeNull()
  })

  it("renders card rows with the lk-list-row--card modifier", () => {
    const { container } = render(
      <ProviderList
        providers={[{ id: "p1", name: "OpenAI", sdkProvider: "openai" }]}
        onAdd={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(container.querySelector(".lk-list-row--card")).not.toBeNull()
  })
  it("renders one card per provider", () => {
    render(
      <ProviderList
        providers={providers}
        onAdd={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("OpenAI")).toBeInTheDocument()
    expect(screen.getByText("Anthropic")).toBeInTheDocument()
  })
  it("shows an empty state when there are no providers", () => {
    render(<ProviderList providers={[]} onAdd={() => {}} onSelect={() => {}} />)
    expect(
      screen.getByRole("heading", { name: /no providers/i }),
    ).toBeInTheDocument()
  })
  it("calls onAdd when the add button is clicked", () => {
    const onAdd = mock(() => {})
    render(
      <ProviderList providers={providers} onAdd={onAdd} onSelect={() => {}} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
  it("calls onSelect with the provider id when a provider is selected", () => {
    const onSelect = mock((_id: string) => {})
    render(
      <ProviderList
        providers={providers}
        onAdd={() => {}}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Select OpenAI" }))
    expect(onSelect).toHaveBeenCalledWith("p_openai")
  })
})
