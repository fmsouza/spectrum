import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { MountFallback } from "./MountFallback"

describe("MountFallback", () => {
  it("shows the message and calls onReload when the button is clicked", () => {
    const onReload = mock(() => {})
    render(<MountFallback message="Couldn't connect" onReload={onReload} />)
    expect(screen.getByText("Couldn't connect")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /reload/i }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
