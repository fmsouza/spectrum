import { describe, expect, it } from "bun:test"
import type { TaskList } from "@spectrum/agent-events"
import { cleanup, render, screen } from "@testing-library/react"
import { TaskRail } from "./TaskRail"

const list: TaskList = {
  items: [
    { content: "A", activeForm: "Doing A", status: "completed" },
    { content: "B", activeForm: "Doing B", status: "in_progress" },
    { content: "C", activeForm: "Doing C", status: "pending" },
    { content: "D", activeForm: "Doing D", status: "pending" },
  ],
  completed: 1,
  total: 4,
}

describe("TaskRail", () => {
  it("shows the completed-over-total count", () => {
    render(<TaskRail taskList={list} />)
    expect(screen.getByText("1/4")).toBeInTheDocument()
    cleanup()
  })

  it("renders one row per task", () => {
    render(<TaskRail taskList={list} />)
    expect(screen.getByText("A")).toBeInTheDocument()
    expect(screen.getByText("Doing B")).toBeInTheDocument()
    expect(screen.getByText("C")).toBeInTheDocument()
    expect(screen.getByText("D")).toBeInTheDocument()
    cleanup()
  })

  it("reports progress via the progressbar role", () => {
    render(<TaskRail taskList={list} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "25",
    )
    cleanup()
  })
})
