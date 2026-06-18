import { describe, expect, it } from "bun:test"
import type { RunnerId } from "@spectrum/agent-events"
import { cleanup, render, screen } from "@testing-library/react"
import { SubRunnerCard } from "./SubRunnerCard"

const rid = "r1" as RunnerId

describe("SubRunnerCard", () => {
  it("shows 'Agent' with the detail beside it", () => {
    render(
      <SubRunnerCard
        runnerId={rid}
        title="Agent"
        detail="Investigate tool rendering"
        status="running"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText("Agent")).toBeInTheDocument()
    expect(screen.getByText("Investigate tool rendering")).toBeInTheDocument()
    cleanup()
  })

  it("shows just the title when no detail is given", () => {
    render(
      <SubRunnerCard
        runnerId={rid}
        title="Agent"
        status="running"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText("Agent")).toBeInTheDocument()
    cleanup()
  })

  it("calls onOpen with the runner id when clicked", () => {
    let called: RunnerId | undefined
    render(
      <SubRunnerCard
        runnerId={rid}
        title="Agent"
        status="running"
        onOpen={(id) => {
          called = id
        }}
      />,
    )
    screen.getByRole("button").click()
    expect(called).toBe(rid)
    cleanup()
  })
})
