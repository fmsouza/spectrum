import { describe, expect, it } from "bun:test"
import type { TaskItem } from "@spectrum/agent-events"
import { cleanup, render, screen } from "@testing-library/react"
import { TaskRow } from "./TaskRow"

const item = (over: Partial<TaskItem>): TaskItem => ({
  content: "Build the rail",
  activeForm: "Building the rail",
  status: "pending",
  ...over,
})

describe("TaskRow", () => {
  it("shows the content and a grey dot when pending", () => {
    render(<TaskRow item={item({ status: "pending" })} />)
    expect(screen.getByText("Build the rail")).toBeInTheDocument()
    expect(screen.getByRole("img")).toHaveAttribute("data-color", "grey")
    cleanup()
  })

  it("shows the activeForm and an amber dot when in progress", () => {
    render(<TaskRow item={item({ status: "in_progress" })} />)
    expect(screen.getByText("Building the rail")).toBeInTheDocument()
    expect(screen.queryByText("Build the rail")).toBeNull()
    expect(screen.getByRole("img")).toHaveAttribute("data-color", "amber")
    cleanup()
  })

  it("shows the content and a green dot when completed", () => {
    render(<TaskRow item={item({ status: "completed" })} />)
    expect(screen.getByText("Build the rail")).toBeInTheDocument()
    expect(screen.getByRole("img")).toHaveAttribute("data-color", "green")
    cleanup()
  })
})
