import { describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { MessageBubble } from "./MessageBubble"

describe("MessageBubble", () => {
  it("renders the assistant message text", () => {
    render(<MessageBubble text="Hello there" />)
    expect(screen.getByText("Hello there")).toBeInTheDocument()
    cleanup()
  })

  it("marks the bubble with the assistant role for styling", () => {
    render(<MessageBubble text="Hi" />)
    expect(screen.getByText("Hi")).toHaveAttribute("data-role", "assistant")
    cleanup()
  })
})
