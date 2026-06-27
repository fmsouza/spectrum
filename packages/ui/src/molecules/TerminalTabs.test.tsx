import { describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TerminalTabs } from "./TerminalTabs"

describe("TerminalTabs", () => {
  it("calls onNewTab when the + button is clicked", () => {
    const onNewTab = mock(() => {})
    render(
      <TerminalTabs
        tabs={[]}
        activeTabId={null}
        onSelectTab={() => {}}
        onNewTab={onNewTab}
        onCloseTab={() => {}}
        onResizeHeight={() => {}}
        currentHeightPx={200}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "New terminal tab" }))
    expect(onNewTab).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it("calls onCloseTab when a tab's ✕ is clicked", () => {
    const onCloseTab = mock((_id: string) => {})
    render(
      <TerminalTabs
        tabs={[{ id: "t1", title: "Terminal", exitCode: null, closed: false }]}
        activeTabId="t1"
        onSelectTab={() => {}}
        onNewTab={() => {}}
        onCloseTab={onCloseTab}
        onResizeHeight={() => {}}
        currentHeightPx={200}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Close tab" }))
    expect(onCloseTab).toHaveBeenCalledTimes(1)
    expect(onCloseTab.mock.calls[0]?.[0]).toBe("t1")
    cleanup()
  })
})
