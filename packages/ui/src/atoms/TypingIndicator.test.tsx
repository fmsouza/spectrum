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

  it("shows the elapsed seconds when provided", () => {
    render(<TypingIndicator elapsedSeconds={45} />)
    expect(screen.getByText(/still generating/i)).toBeInTheDocument()
    expect(screen.getByText(/45s/)).toBeInTheDocument()
    cleanup()
  })

  it("shows only the dots when elapsedSeconds is undefined", () => {
    render(<TypingIndicator />)
    expect(screen.queryByText(/still generating/i)).toBeNull()
    cleanup()
  })
})
