import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "./FormField"

describe("FormField", () => {
  it("labels the wrapped control via the shared id", () => {
    render(
      <FormField id="base-url" label="Base URL">
        <TextInput id="base-url" value="" onChange={() => {}} />
      </FormField>,
    )
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument()
  })
  it("shows the error message when an error is provided", () => {
    render(
      <FormField id="base-url" label="Base URL" error="Required">
        <TextInput id="base-url" value="" onChange={() => {}} />
      </FormField>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Required")
    expect(screen.getByRole("alert")).toHaveClass("lk-field__error")
  })
  it("renders no alert when there is no error", () => {
    render(
      <FormField id="base-url" label="Base URL">
        <TextInput id="base-url" value="" onChange={() => {}} />
      </FormField>,
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("marks the field wrapper with lk-field", () => {
    const { container } = render(
      <FormField label="Name" id="name-field">
        <input />
      </FormField>,
    )
    expect(container.querySelector(".lk-field")).not.toBeNull()
  })
})
