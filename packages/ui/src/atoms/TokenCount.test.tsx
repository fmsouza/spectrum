import { describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { TokenCount } from "./TokenCount"

describe("TokenCount", () => {
  it("renders the value and unit when given a small count", () => {
    render(<TokenCount value={42} unit="in" />)
    expect(screen.getByText("42 in")).toBeInTheDocument()
    cleanup()
  })

  it("abbreviates thousands with a k suffix when the value is large", () => {
    render(<TokenCount value={1234} unit="out" />)
    expect(screen.getByText("1.2k out")).toBeInTheDocument()
    cleanup()
  })

  it("exposes the unit as a data attribute so styles can target it", () => {
    render(<TokenCount value={5} unit="in" />)
    expect(screen.getByText("5 in")).toHaveAttribute("data-unit", "in")
    cleanup()
  })
})
