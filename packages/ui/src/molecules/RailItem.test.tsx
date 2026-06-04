import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { RailItem } from "./RailItem"

describe("RailItem", () => {
  it("renders an icon button exposing the label", () => {
    render(
      <RailItem label="Sessions" onClick={() => {}}>
        <svg />
      </RailItem>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument()
  })
  it("forwards the active state to aria-current", () => {
    render(
      <RailItem label="Settings" active onClick={() => {}}>
        <svg />
      </RailItem>,
    )
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("calls onClick when activated", () => {
    const onClick = mock(() => {})
    render(
      <RailItem label="Sessions" onClick={onClick}>
        <svg />
      </RailItem>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
