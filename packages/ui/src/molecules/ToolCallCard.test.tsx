import { describe, expect, it } from "bun:test"
import type { ToolCallItem } from "@launchkit/agent-events"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ToolCallCard } from "./ToolCallCard"

const item: ToolCallItem = {
  kind: "tool-call",
  callId: "c1",
  tool: "Bash",
  status: "ok",
  output: "build succeeded",
  exitCode: 0,
}

describe("ToolCallCard", () => {
  it("shows the tool name in the header", () => {
    render(<ToolCallCard item={item} expanded={false} onToggle={() => {}} />)
    expect(screen.getByText("Bash")).toBeInTheDocument()
    cleanup()
  })

  it("hides the output when collapsed", () => {
    render(<ToolCallCard item={item} expanded={false} onToggle={() => {}} />)
    expect(screen.queryByText("build succeeded")).toBeNull()
    cleanup()
  })

  it("shows the output when expanded", () => {
    render(<ToolCallCard item={item} expanded onToggle={() => {}} />)
    expect(screen.getByText("build succeeded")).toBeInTheDocument()
    cleanup()
  })

  it("marks the status on the card so styles can tint it", () => {
    render(<ToolCallCard item={item} expanded onToggle={() => {}} />)
    expect(screen.getByTestId("tool-call-c1")).toHaveAttribute(
      "data-status",
      "ok",
    )
    cleanup()
  })

  it("calls onToggle when the header is clicked", () => {
    let toggled = false
    render(
      <ToolCallCard
        item={item}
        expanded={false}
        onToggle={() => {
          toggled = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Bash/ }))
    expect(toggled).toBe(true)
    cleanup()
  })
})
