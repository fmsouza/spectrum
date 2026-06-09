import { describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { ToolIcon } from "./ToolIcon"

describe("ToolIcon", () => {
  it("labels the icon with the tool name for accessibility", () => {
    render(<ToolIcon tool="Bash" />)
    expect(screen.getByLabelText("Bash")).toBeInTheDocument()
  })

  it("tags a known tool with its own glyph key", () => {
    render(<ToolIcon tool="Bash" />)
    expect(screen.getByLabelText("Bash")).toHaveAttribute("data-tool", "bash")
    cleanup()
  })

  it("falls back to the default glyph key for an unknown tool", () => {
    render(<ToolIcon tool="Frobnicate" />)
    expect(screen.getByLabelText("Frobnicate")).toHaveAttribute(
      "data-tool",
      "default",
    )
    cleanup()
  })
})
