import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConfirmDialog } from "./ConfirmDialog"

describe("ConfirmDialog", () => {
  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete session?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText("Delete session?")).toBeNull()
  })
  it("calls onConfirm for a simple confirm", () => {
    const onConfirm = mock(() => {})
    render(
      <ConfirmDialog
        open
        title="Delete session?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
  it("disables confirm until the phrase is typed exactly when confirmPhrase is set", () => {
    const onConfirm = mock(() => {})
    render(
      <ConfirmDialog
        open
        title="Reset app?"
        message="Type RESET to confirm."
        confirmLabel="Reset"
        confirmPhrase="RESET"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    const confirm = screen.getByRole("button", { name: "Reset" })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText("confirm-phrase"), {
      target: { value: "RES" },
    })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText("confirm-phrase"), {
      target: { value: "RESET" },
    })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
  it("does not render the phrase input for a simple confirm", () => {
    render(
      <ConfirmDialog
        open
        title="Delete?"
        message="x"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByLabelText("confirm-phrase")).toBeNull()
  })
})
