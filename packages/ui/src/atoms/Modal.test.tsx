import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    render(
      <Modal title="New session" open={false} onClose={() => {}}>
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("renders a labelled dialog with its title and children when open", () => {
    render(
      <Modal title="New session" open onClose={() => {}}>
        <p>body content</p>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog", { name: "New session" })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("body content")).toBeInTheDocument()
  })
  it("calls onClose when the close button is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("calls onClose when the Escape key is pressed", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("calls onClose when the backdrop is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByTestId("modal-backdrop"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("does not call onClose when the dialog body is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText("body"))
    expect(onClose).not.toHaveBeenCalled()
  })
  it("marks the dialog, header, close and body with hooks", () => {
    const { container } = render(<Modal title="T" open onClose={() => {}}><p>body</p></Modal>)
    expect(container.querySelector("dialog.lk-modal")).not.toBeNull()
    expect(container.querySelector(".lk-modal__header")).not.toBeNull()
    expect(container.querySelector(".lk-modal__close")).not.toBeNull()
    expect(container.querySelector(".lk-modal__body")).not.toBeNull()
  })
})
