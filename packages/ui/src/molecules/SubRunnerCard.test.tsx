import { describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SubRunnerCard } from "./SubRunnerCard"

describe("SubRunnerCard", () => {
  it("renders the sub-runner title", () => {
    render(
      <SubRunnerCard
        runnerId="r2"
        title="search docs"
        status="running"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText("search docs")).toBeInTheDocument()
    cleanup()
  })

  it("calls onOpen with the runner id when Open is clicked", () => {
    let opened: string | undefined
    render(
      <SubRunnerCard
        runnerId="r2"
        title="search docs"
        status="running"
        onOpen={(id) => {
          opened = id
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /search docs/ }))
    expect(opened).toBe("r2")
    cleanup()
  })
})
