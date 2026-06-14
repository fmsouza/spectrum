import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { StatusDot } from "./StatusDot"

describe("StatusDot", () => {
  it("exposes an accessible label describing the status when on", () => {
    render(<StatusDot status="on" label="Proxy running" />)
    expect(screen.getByLabelText("Proxy running")).toBeInTheDocument()
  })
  it("marks the dot green when the status is on", () => {
    render(<StatusDot status="on" label="Proxy running" />)
    expect(screen.getByLabelText("Proxy running")).toHaveAttribute(
      "data-color",
      "green",
    )
  })
  it("marks the dot grey when the status is off", () => {
    render(<StatusDot status="off" label="Proxy stopped" />)
    expect(screen.getByLabelText("Proxy stopped")).toHaveAttribute(
      "data-color",
      "grey",
    )
  })
  it("marks the dot red when the status is error", () => {
    render(<StatusDot status="error" label="tool error" />)
    expect(screen.getByLabelText("tool error")).toHaveAttribute(
      "data-color",
      "red",
    )
  })
  it("marks the dot amber when the status is active", () => {
    render(<StatusDot status="active" label="task in progress" />)
    expect(screen.getByLabelText("task in progress")).toHaveAttribute(
      "data-color",
      "amber",
    )
  })
})
