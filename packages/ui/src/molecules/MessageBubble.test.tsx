import { describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MessageBubble } from "./MessageBubble"

describe("MessageBubble", () => {
  it("renders the message text", () => {
    render(<MessageBubble text="Hello there" />)
    expect(screen.getByText("Hello there")).toBeInTheDocument()
    cleanup()
  })

  it("renders Markdown (bold + inline code) as real elements", () => {
    render(<MessageBubble text="this is **bold** and `code`" />)
    expect(screen.getByText("bold").tagName).toBe("STRONG")
    expect(screen.getByText("code").tagName).toBe("CODE")
    cleanup()
  })

  it("defaults to the assistant role", () => {
    const { container } = render(<MessageBubble text="hi" />)
    expect(container.querySelector(".lk-message-bubble")).toHaveAttribute(
      "data-role",
      "assistant",
    )
    cleanup()
  })

  it("marks a user message with data-role=user (for right alignment)", () => {
    const { container } = render(<MessageBubble text="hi" author="user" />)
    expect(container.querySelector(".lk-message-bubble")).toHaveAttribute(
      "data-role",
      "user",
    )
    cleanup()
  })

  it("marks an error-toned message with data-tone=error and an alert role", () => {
    const { container } = render(
      <MessageBubble text="API Error: 429 rate limited" tone="error" />,
    )
    const bubble = container.querySelector(".lk-message-bubble")
    expect(bubble).toHaveAttribute("data-tone", "error")
    expect(bubble).toHaveAttribute("role", "alert")
    cleanup()
  })

  it("carries no tone attribute or alert role by default", () => {
    const { container } = render(<MessageBubble text="hi" />)
    const bubble = container.querySelector(".lk-message-bubble")
    expect(bubble).not.toHaveAttribute("data-tone")
    expect(bubble).not.toHaveAttribute("role")
    cleanup()
  })

  it("renders a Retry button and fires onRetry when tone is error", () => {
    let retried = 0
    render(
      <MessageBubble
        text="API Error: rate limited"
        tone="error"
        onRetry={() => {
          retried += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /retry/i }))
    expect(retried).toBe(1)
    cleanup()
  })

  it("does not render a Retry button when there is no error tone", () => {
    render(<MessageBubble text="all good" onRetry={() => {}} />)
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
    cleanup()
  })
})
