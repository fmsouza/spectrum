import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { DataPage } from "./DataPage"

describe("DataPage", () => {
  it("requires typing RESET before the reset button is enabled, then calls onReset", () => {
    const onReset = mock(() => {})
    render(<DataPage onReset={onReset} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset app" }))
    const confirm = screen.getByRole("button", { name: "Reset everything" })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText("confirm-phrase"), {
      target: { value: "RESET" },
    })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
  it("does not call onReset when the dialog is cancelled", () => {
    const onReset = mock(() => {})
    render(<DataPage onReset={onReset} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset app" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onReset).not.toHaveBeenCalled()
  })
})
