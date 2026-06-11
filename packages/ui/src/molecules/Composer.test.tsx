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
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
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
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(calls).toBe(0)
    cleanup()
  })

  it("clears the field after a successful send", () => {
    render(<Composer onSend={() => {}} />)
    const box = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "hi" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(box.value).toBe("")
    cleanup()
  })

  it("disables the input and button when disabled", () => {
    render(<Composer onSend={() => {}} disabled />)
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
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

  it("shows a stop button instead of send while busy and fires onInterrupt", () => {
    let interrupted = 0
    render(
      <Composer
        onSend={() => {}}
        busy
        onInterrupt={() => {
          interrupted += 1
        }}
      />,
    )
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Stop run" }))
    expect(interrupted).toBe(1)
    cleanup()
  })

  it("keeps the textarea enabled while busy so the user can steer", () => {
    render(<Composer onSend={() => {}} busy onInterrupt={() => {}} />)
    expect(screen.getByRole("textbox")).toBeEnabled()
    cleanup()
  })

  it("disables the send button when the input is empty", () => {
    render(<Composer onSend={() => {}} />)
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
    cleanup()
  })

  it("renders the mode selector and forwards mode changes", () => {
    let picked: string | undefined
    render(
      <Composer
        onSend={() => {}}
        mode="manual"
        supportedModes={["manual", "plan"]}
        onModeChange={(m) => {
          picked = m
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /plan mode/i }))
    expect(picked).toBe("plan")
    cleanup()
  })

  it("hides the mode selector when no modes are provided", () => {
    render(<Composer onSend={() => {}} />)
    expect(screen.queryByRole("button", { name: /approval/i })).toBeNull()
    cleanup()
  })
})
