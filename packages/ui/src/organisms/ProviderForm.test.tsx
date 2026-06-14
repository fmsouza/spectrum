import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ProviderForm } from "./ProviderForm"

const customFields = [
  {
    name: "serverUrl",
    label: "Server URL",
    kind: "url" as const,
    required: false,
  },
  {
    name: "headers",
    label: "Custom headers",
    kind: "headers" as const,
    required: false,
  },
]

describe("ProviderForm", () => {
  it("renders a labelled input for each non-headers config field", () => {
    render(
      <ProviderForm fields={customFields} values={{}} onChange={() => {}} />,
    )
    expect(screen.getByLabelText("Server URL")).toBeDefined()
  })

  it("renders a headers key-value editor for a headers field", () => {
    render(
      <ProviderForm fields={customFields} values={{}} onChange={() => {}} />,
    )
    expect(screen.getByText("Custom headers")).toBeDefined()
    expect(screen.getByLabelText("Add header")).toBeDefined()
  })
})
