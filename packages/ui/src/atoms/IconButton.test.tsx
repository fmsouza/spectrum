import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { IconButton } from "./IconButton"

describe("IconButton", () => {
  it("exposes the label as its accessible name", () => {
    render(
      <IconButton label="Sessions" onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument()
  })
  it("calls onClick when clicked", () => {
    const onClick = mock(() => {})
    render(
      <IconButton label="Settings" onClick={onClick}>
        <svg />
      </IconButton>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it("marks itself current when active is true", () => {
    render(
      <IconButton label="Sessions" active onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("is not current when active is omitted", () => {
    render(
      <IconButton label="Sessions" onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(
      screen.getByRole("button", { name: "Sessions" }),
    ).not.toHaveAttribute("aria-current")
  })
})
