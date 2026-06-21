import { describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { TypingIndicator } from "./TypingIndicator"

describe("TypingIndicator", () => {
  it("renders a status role with three dots", () => {
    const { container } = render(<TypingIndicator />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(container.querySelectorAll(".lk-typing__dot")).toHaveLength(3)
    cleanup()
  })

  it("wraps the three dots in a single lk-typing__dots row", () => {
    const { container } = render(<TypingIndicator />)
    const rows = container.querySelectorAll(".lk-typing__dots")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.querySelectorAll(".lk-typing__dot")).toHaveLength(3)
    cleanup()
  })

  it("shows Thinking… with the formatted elapsed time when elapsedSeconds is provided", () => {
    render(<TypingIndicator elapsedSeconds={45} />)
    expect(screen.getByText(/Thinking/i)).toBeInTheDocument()
    expect(screen.getByText(/45s/)).toBeInTheDocument()
    cleanup()
  })

  it("formats minutes and hours in the elapsed label", () => {
    const { rerender } = render(<TypingIndicator elapsedSeconds={133} />)
    expect(screen.getByText(/2m 13s/)).toBeInTheDocument()
    rerender(<TypingIndicator elapsedSeconds={3912} />)
    expect(screen.getByText(/1h 5m 12s/)).toBeInTheDocument()
    cleanup()
  })

  it("shows only the dots when elapsedSeconds is undefined", () => {
    render(<TypingIndicator />)
    expect(screen.queryByText(/Thinking/i)).toBeNull()
    cleanup()
  })

  it("uses an aria-label that matches the visible text when elapsed, else Working", () => {
    const { rerender } = render(<TypingIndicator elapsedSeconds={133} />)
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Thinking… (2m 13s)",
    )
    rerender(<TypingIndicator />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Working")
    cleanup()
  })
})
