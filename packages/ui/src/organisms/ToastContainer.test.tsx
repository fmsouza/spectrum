import { describe, expect, it, mock } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ToastContainer, type ToastItem } from "./ToastContainer"

const items: ToastItem[] = [
  { id: "a", tone: "success", message: "Deleted", autoDismissMs: 5000 },
  { id: "b", tone: "error", message: "Boom" }, // sticky
]

describe("ToastContainer", () => {
  it("renders one toast per notification", () => {
    render(<ToastContainer notifications={items} onDismiss={() => {}} />)
    expect(screen.getByText("Deleted")).toBeInTheDocument()
    expect(screen.getByText("Boom")).toBeInTheDocument()
  })

  it("schedules auto-dismiss only for notifications with autoDismissMs, then calls onDismiss", () => {
    const onDismiss = mock((_id: string) => {})
    const scheduled: Array<{ ms: number; cb: () => void }> = []
    render(
      <ToastContainer
        notifications={items}
        onDismiss={onDismiss}
        schedule={(cb, ms) => {
          scheduled.push({ ms, cb })
          return () => {}
        }}
      />,
    )
    // only the auto-dismissible "a" scheduled
    expect(scheduled.length).toBe(1)
    expect(scheduled[0]?.ms).toBe(5000)
    scheduled[0]?.cb()
    expect(onDismiss).toHaveBeenCalledWith("a")
  })
})
