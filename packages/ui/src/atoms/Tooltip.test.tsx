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

  it("applies an extra className to the tooltip root when provided", () => {
    const { container } = render(
      <Tooltip label="Help text" className="lk-session-row__name">
        <button type="button">Go</button>
      </Tooltip>,
    )
    const root = container.querySelector(".lk-tooltip")
    expect(root).not.toBeNull()
    expect(root).toHaveClass("lk-session-row__name")
  })

  it("uses only the base class on the root when no className is given", () => {
    const { container } = render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    expect(container.querySelector(".lk-tooltip")?.className).toBe("lk-tooltip")
  })

  it("ports the bubble to document.body so ancestor overflow cannot clip it", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Go</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByRole("button", { name: "Go" }))
    const bubble = screen.getByRole("tooltip")
    // The bubble must NOT live inside the .lk-tooltip wrapper (which is inside
    // the trigger's DOM subtree and subject to ancestor overflow clipping). It
    // must be a direct descendant of document.body.
    const bubbleParent = bubble.parentElement
    expect(bubbleParent).toBe(document.body)
  })
})
