import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { Toast } from "./Toast"

describe("Toast", () => {
  it("renders the message with its tone", () => {
    render(
      <Toast tone="error" message="Couldn't delete" onDismiss={() => {}} />,
    )
    const el = screen.getByRole("status")
    expect(el).toHaveTextContent("Couldn't delete")
    expect(el).toHaveAttribute("data-tone", "error")
  })

  it("fires the action when its button is clicked", () => {
    const onClick = mock(() => {})
    render(
      <Toast
        tone="error"
        message="x"
        action={{ label: "Retry", onClick }}
        onDismiss={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("fires onDismiss when the dismiss button is clicked", () => {
    const onDismiss = mock(() => {})
    render(<Toast tone="success" message="Deleted" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
