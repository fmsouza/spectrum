import { describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { DiffLine } from "./DiffLine"

describe("DiffLine", () => {
  it("renders an added line tagged as add when it starts with a plus", () => {
    render(<DiffLine text="+const x = 1" />)
    expect(screen.getByText("+const x = 1")).toHaveAttribute("data-kind", "add")
    cleanup()
  })

  it("renders a removed line tagged as del when it starts with a minus", () => {
    render(<DiffLine text="-const x = 0" />)
    expect(screen.getByText("-const x = 0")).toHaveAttribute("data-kind", "del")
    cleanup()
  })

  it("renders any other line tagged as context", () => {
    render(<DiffLine text=" const x = 1" />)
    expect(screen.getByText(" const x = 1", { trim: false })).toHaveAttribute(
      "data-kind",
      "context",
    )
    cleanup()
  })
})
