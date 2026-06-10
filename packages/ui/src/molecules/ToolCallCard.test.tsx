import { describe, expect, it } from "bun:test"
import type { ToolCallItem } from "@launchkit/agent-events"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ToolCallCard, toolCallSummary } from "./ToolCallCard"

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

  it("shows the shell command inline in the header", () => {
    render(
      <ToolCallCard
        item={{
          kind: "tool-call",
          callId: "c2",
          tool: "Bash",
          input: { command: "ls -la /repo", cwd: "/repo" },
          status: "running",
        }}
        expanded={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText("ls -la /repo")).toBeInTheDocument()
    cleanup()
  })

  it("summarizes by input shape: command, then file path, then skill/name", () => {
    expect(toolCallSummary({ command: "echo hi" })).toBe("echo hi")
    expect(toolCallSummary({ file_path: "src/a.ts" })).toBe("src/a.ts")
    expect(toolCallSummary({ command: "brainstorming" })).toBe("brainstorming")
    expect(toolCallSummary({ name: "explore" })).toBe("explore")
    expect(toolCallSummary(undefined)).toBeUndefined()
    expect(toolCallSummary({ foo: 1 })).toBeUndefined()
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
