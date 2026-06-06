import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { Tooltip } from "./Tooltip"

describe("Tooltip", () => {
  it("renders its child trigger", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument()
  })

  it("hides the tooltip bubble by default", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("shows the tooltip with its label when the trigger is focused", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByRole("button", { name: "Go" }))
    expect(screen.getByRole("tooltip")).toHaveTextContent("Help text")
  })

  it("shows the tooltip when the trigger is hovered", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    fireEvent.mouseOver(screen.getByRole("button", { name: "Go" }))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
  })

  it("hides the tooltip when Escape is pressed", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    const btn = screen.getByRole("button", { name: "Go" })
    fireEvent.focus(btn)
    fireEvent.keyDown(btn, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
