import { describe, expect, it, mock } from "bun:test"
import type { SecretFieldSpec } from "@spectrum/providers"
import { fireEvent, render, screen } from "@testing-library/react"
import { SecretFieldsForm } from "./SecretFieldsForm"

const fields: readonly SecretFieldSpec[] = [
  { name: "apiKey", label: "API key", required: true },
]

describe("SecretFieldsForm", () => {
  it("renders a password input per secret field using the catalog label", () => {
    render(<SecretFieldsForm fields={fields} values={{}} onChange={() => {}} />)
    const input = screen.getByLabelText("API key") as HTMLInputElement
    expect(input.type).toBe("password")
  })

  it("emits (name, value) on change", () => {
    const onChange = mock(() => {})
    render(<SecretFieldsForm fields={fields} values={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-123" },
    })
    expect(onChange).toHaveBeenCalledWith("apiKey", "sk-123")
  })
})
