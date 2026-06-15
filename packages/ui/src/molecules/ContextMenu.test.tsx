import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { ContextMenu } from "./ContextMenu"

describe("ContextMenu", () => {
  it("renders each item label", () => {
    render(
      <ContextMenu
        x={10}
        y={20}
        items={[{ label: "Delete session", onSelect: () => {} }]}
        onClose={() => {}}
      />,
    )
    expect(
      screen.getByRole("menuitem", { name: "Delete session" }),
    ).toBeInTheDocument()
  })
  it("calls onSelect then onClose when an item is clicked", () => {
    const onSelect = mock(() => {})
    const onClose = mock(() => {})
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Delete", onSelect }]}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("calls onClose when Escape is pressed", () => {
    const onClose = mock(() => {})
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "X", onSelect: () => {} }]}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("marks danger items with a data attribute", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          { label: "Delete", onSelect: () => {}, danger: true },
          { label: "Keep", onSelect: () => {} },
        ]}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "danger",
    )
    expect(screen.getByRole("menuitem", { name: "Keep" })).toHaveAttribute(
      "data-variant",
      "default",
    )
  })
})
