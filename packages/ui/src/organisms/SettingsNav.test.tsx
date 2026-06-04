import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { SettingsNav } from "./SettingsNav"

const sections = [
  { key: "providers", label: "Providers" },
  { key: "harnesses", label: "Harnesses" },
  { key: "aliases", label: "Aliases" },
]

describe("SettingsNav", () => {
  it("renders a link per section", () => {
    render(
      <SettingsNav sections={sections} active="providers" onSelect={() => {}} />,
    )
    expect(screen.getByRole("link", { name: "Providers" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Harnesses" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Aliases" })).toBeInTheDocument()
  })
  it("marks the active section as current", () => {
    render(
      <SettingsNav sections={sections} active="harnesses" onSelect={() => {}} />,
    )
    expect(screen.getByRole("link", { name: "Harnesses" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("calls onSelect with the section key when a link is clicked", () => {
    const onSelect = mock((_k: string) => {})
    render(
      <SettingsNav
        sections={sections}
        active="providers"
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole("link", { name: "Aliases" }))
    expect(onSelect).toHaveBeenCalledWith("aliases")
  })
})
