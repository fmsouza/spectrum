import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { ModelPicker } from "./ModelPicker"

describe("ModelPicker", () => {
  it("renders a disabled select with a spinner while loading", () => {
    render(
      <ModelPicker loading={true} models={[]} value="" onChange={() => {}} />,
    )
    expect(screen.getByLabelText("Model")).toBeDisabled()
    expect(
      screen.getByRole("status", { name: "Loading models…" }),
    ).toBeInTheDocument()
  })

  it("renders a dropdown of discovered models", () => {
    const onChange = mock(() => {})
    render(
      <ModelPicker
        loading={false}
        models={["gpt-4o", "gpt-4o-mini"]}
        value=""
        onChange={onChange}
      />,
    )
    expect(
      screen.getByRole("option", { name: "Select a model…" }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-4o" },
    })
    expect(onChange).toHaveBeenCalledWith("gpt-4o")
  })

  it("falls back to free-text and surfaces the error message", () => {
    render(
      <ModelPicker
        loading={false}
        models={[]}
        value=""
        onChange={() => {}}
        errorMessage="Couldn't list models — enter one manually."
      />,
    )
    const input = screen.getByLabelText("Model") as HTMLInputElement
    expect(input.tagName).toBe("INPUT")
    expect(screen.getByText(/enter one manually/i)).toBeInTheDocument()
  })

  it("shows free-text (not a dropdown) when an errorMessage is set even with models present", () => {
    render(
      <ModelPicker
        loading={false}
        models={["gpt-4o"]}
        value=""
        onChange={() => {}}
        errorMessage="discovery failed"
      />,
    )
    const field = screen.getByLabelText("Model") as HTMLElement
    expect(field.tagName).toBe("INPUT")
    expect(screen.getByText("discovery failed")).toBeInTheDocument()
    // and NOT a select option for the model
    expect(screen.queryByRole("option", { name: "gpt-4o" })).toBeNull()
  })
})
