import { describe, expect, it, mock } from "bun:test"
import type { SessionId } from "@launchkit/types"
import { SessionIdSchema } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { TabStrip } from "./TabStrip"

const id = (n: number): SessionId =>
  SessionIdSchema.parse(`s_0000000${n}-0000-4000-8000-000000000000`)

const a = id(1)
const b = id(2)

describe("TabStrip", () => {
  it("renders a tab per session id", () => {
    render(
      <TabStrip
        tabs={[a, b]}
        activeId={a}
        labels={{}}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getAllByRole("tab")).toHaveLength(2)
  })

  it("uses the provided label when one is known", () => {
    render(
      <TabStrip
        tabs={[a]}
        activeId={a}
        labels={{ [a]: "claude" }}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole("tab")).toHaveTextContent("claude")
  })

  it("marks the active tab as selected", () => {
    render(
      <TabStrip
        tabs={[a, b]}
        activeId={b}
        labels={{}}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const tabs = screen.getAllByRole("tab")
    expect(tabs[1]).toHaveAttribute("aria-selected", "true")
    expect(tabs[0]).toHaveAttribute("aria-selected", "false")
  })

  it("calls onSelect with the id when a tab is clicked", () => {
    const onSelect = mock((_id: SessionId) => {})
    render(
      <TabStrip
        tabs={[a, b]}
        activeId={a}
        labels={{}}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole("tab")[1] as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith(b)
  })

  it("calls onClose with the id when the close button is clicked", () => {
    const onClose = mock((_id: SessionId) => {})
    render(
      <TabStrip
        tabs={[a]}
        activeId={a}
        labels={{}}
        onSelect={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalledWith(a)
  })

  it("does not call onSelect when the close button is clicked", () => {
    const onSelect = mock((_id: SessionId) => {})
    const onClose = mock((_id: SessionId) => {})
    render(
      <TabStrip
        tabs={[a]}
        activeId={a}
        labels={{}}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
