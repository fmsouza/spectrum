import { describe, expect, it } from "bun:test"
import type { ApprovalDecision, ApprovalItem } from "@spectrum/agent-events"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ApprovalCard } from "./ApprovalCard"

const pending: ApprovalItem = {
  kind: "approval",
  requestId: "r1",
  target: { kind: "command", detail: "rm -rf build" },
}

describe("ApprovalCard", () => {
  it("renders the approval target detail", () => {
    render(<ApprovalCard item={pending} onDecide={() => {}} />)
    expect(screen.getByText("rm -rf build")).toBeInTheDocument()
    cleanup()
  })

  it("calls onDecide with allow when Approve is clicked", () => {
    let decision: ApprovalDecision | undefined
    render(
      <ApprovalCard
        item={pending}
        onDecide={(d) => {
          decision = d
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(decision).toBe("allow")
    cleanup()
  })

  it("calls onDecide with deny when Deny is clicked", () => {
    let decision: ApprovalDecision | undefined
    render(
      <ApprovalCard
        item={pending}
        onDecide={(d) => {
          decision = d
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Deny" }))
    expect(decision).toBe("deny")
    cleanup()
  })

  it("calls onDecide with allow-always when Always is clicked", () => {
    let decision: ApprovalDecision | undefined
    render(
      <ApprovalCard
        item={pending}
        onDecide={(d) => {
          decision = d
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Always" }))
    expect(decision).toBe("allow-always")
    cleanup()
  })

  it("shows the resolved decision and hides the buttons once decided", () => {
    const resolved: ApprovalItem = { ...pending, decision: "allow", by: "user" }
    render(<ApprovalCard item={resolved} onDecide={() => {}} />)
    expect(screen.getByText(/allow/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
    cleanup()
  })

  it("disables the buttons when inert (replay)", () => {
    render(<ApprovalCard item={pending} onDecide={() => {}} inert />)
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
    cleanup()
  })
})
