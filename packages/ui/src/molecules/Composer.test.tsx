import { describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Composer } from "./Composer"

describe("Composer", () => {
  it("calls onSend with the typed text when Send is clicked", () => {
    let sent: string | undefined
    render(
      <Composer
        onSend={(t) => {
          sent = t
        }}
      />,
    )
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "do the thing" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(sent).toBe("do the thing")
    cleanup()
  })

  it("does not call onSend for whitespace-only input", () => {
    let calls = 0
    render(
      <Composer
        onSend={() => {
          calls += 1
        }}
      />,
    )
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(calls).toBe(0)
    cleanup()
  })

  it("clears the field after a successful send", () => {
    render(<Composer onSend={() => {}} />)
    const box = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "hi" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(box.value).toBe("")
    cleanup()
  })

  it("disables the input and button when disabled", () => {
    render(<Composer onSend={() => {}} disabled />)
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    cleanup()
  })

  it("sends on Enter and clears the field", () => {
    let sent: string | undefined
    render(
      <Composer
        onSend={(t) => {
          sent = t
        }}
      />,
    )
    const box = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "ship it" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(sent).toBe("ship it")
    expect(box.value).toBe("")
    cleanup()
  })

  it("does NOT send on Shift+Enter (newline instead)", () => {
    let calls = 0
    render(
      <Composer
        onSend={() => {
          calls += 1
        }}
      />,
    )
    const box = screen.getByRole("textbox")
    fireEvent.change(box, { target: { value: "line one" } })
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
    expect(calls).toBe(0)
    cleanup()
  })
})
