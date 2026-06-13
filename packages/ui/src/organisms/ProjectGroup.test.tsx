import { describe, expect, it } from "bun:test"
import type { Session } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ProjectGroup } from "./ProjectGroup"

const session = (id: string): Session => ({
  id: id as Session["id"],
  harnessId: "claude" as Session["harnessId"],
  startedAt: "2026-06-07T10:00:00.000Z",
})

const baseProps = {
  name: "api",
  sessionCount: 12,
  sessions: [session("s1"), session("s2")],
  collapsed: false,
  labelFor: () => ({ harnessName: "claude", model: "default" }),
  onToggle: () => {},
  onSelect: () => {},
  onMore: () => {},
}

describe("ProjectGroup", () => {
  it("renders the project name and session count in the header", () => {
    render(<ProjectGroup {...baseProps} />)
    expect(screen.getByText("api")).toBeTruthy()
    expect(screen.getByText("12")).toBeTruthy()
    cleanup()
  })

  it("hides session rows when collapsed", () => {
    render(<ProjectGroup {...baseProps} collapsed />)
    expect(screen.queryByText("s1")).toBeNull()
    cleanup()
  })

  it("calls onToggle when the header is clicked", () => {
    let toggled = false
    render(
      <ProjectGroup
        {...baseProps}
        onToggle={() => {
          toggled = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /api/ }))
    expect(toggled).toBe(true)
    cleanup()
  })

  it("shows a Show-more button when more sessions exist than are loaded", () => {
    render(
      <ProjectGroup
        {...baseProps}
        sessionCount={12}
        sessions={[session("s1"), session("s2")]}
      />,
    )
    expect(screen.getByText("Show 10 more")).toBeTruthy()
    cleanup()
  })

  it("hides the Show-more button when all sessions are loaded", () => {
    render(
      <ProjectGroup
        {...baseProps}
        sessionCount={2}
        sessions={[session("s1"), session("s2")]}
      />,
    )
    expect(screen.queryByText("Show 10 more")).toBeNull()
    cleanup()
  })

  it("calls onMore when the Show-more button is clicked", () => {
    let more = false
    render(
      <ProjectGroup
        {...baseProps}
        onMore={() => {
          more = true
        }}
      />,
    )
    fireEvent.click(screen.getByText("Show 10 more"))
    expect(more).toBe(true)
    cleanup()
  })

  it("calls onSelect with the session id when a row is clicked", () => {
    let selected: string | undefined
    render(
      <ProjectGroup
        {...baseProps}
        onSelect={(id) => {
          selected = id
        }}
      />,
    )
    fireEvent.click(screen.getByText("s1"))
    expect(selected).toBe("s1")
    cleanup()
  })
})
