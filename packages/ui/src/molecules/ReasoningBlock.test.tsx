import { describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ReasoningBlock } from "./ReasoningBlock"

describe("ReasoningBlock", () => {
  it("hides the reasoning text when collapsed", () => {
    render(
      <ReasoningBlock
        text="thinking deeply"
        expanded={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.queryByText("thinking deeply")).toBeNull()
    cleanup()
  })

  it("shows the reasoning text when expanded", () => {
    render(
      <ReasoningBlock text="thinking deeply" expanded onToggle={() => {}} />,
    )
    expect(screen.getByText("thinking deeply")).toBeInTheDocument()
    cleanup()
  })

  it("calls onToggle when the header is clicked", () => {
    let toggled = false
    render(
      <ReasoningBlock
        text="x"
        expanded={false}
        onToggle={() => {
          toggled = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /reasoning/i }))
    expect(toggled).toBe(true)
    cleanup()
  })
})
