import { describe, expect, it } from "bun:test"
import type { Session } from "@launchkit/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ProjectList } from "./ProjectList"

const baseProps = {
  projects: [
    { id: "prj_a", name: "api", sessionCount: 1 },
    { id: "prj_b", name: "web", sessionCount: 0 },
  ],
  sessionsByProject: {
    prj_a: [
      {
        id: "s1",
        harnessId: "claude",
        startedAt: "2026-06-07T10:00:00.000Z",
      } as Session,
    ],
  },
  collapsed: new Set<string>(),
  labelFor: () => ({ harnessName: "claude", model: "default" }),
  onToggle: () => {},
  onSelect: () => {},
  onMore: () => {},
  onNew: () => {},
}

describe("ProjectList", () => {
  it("renders a New-session button and one group per project", () => {
    render(<ProjectList {...baseProps} />)
    expect(screen.getByText("+ New session")).toBeTruthy()
    expect(screen.getByText("api")).toBeTruthy()
    expect(screen.getByText("web")).toBeTruthy()
    cleanup()
  })

  it("shows an empty state when there are no projects", () => {
    render(<ProjectList {...baseProps} projects={[]} sessionsByProject={{}} />)
    expect(screen.getByText(/no projects/i)).toBeTruthy()
    cleanup()
  })

  it("calls onNew when the New-session button is clicked", () => {
    let clicked = false
    render(
      <ProjectList
        {...baseProps}
        onNew={() => {
          clicked = true
        }}
      />,
    )
    fireEvent.click(screen.getByText("+ New session"))
    expect(clicked).toBe(true)
    cleanup()
  })

  it("hides a collapsed project's rows", () => {
    render(<ProjectList {...baseProps} collapsed={new Set(["prj_a"])} />)
    expect(screen.queryByText("s1")).toBeNull()
    cleanup()
  })

  it("calls onToggle with the project id when a group header is clicked", () => {
    let toggled: string | undefined
    render(
      <ProjectList
        {...baseProps}
        onToggle={(id) => {
          toggled = id
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /api/ }))
    expect(toggled).toBe("prj_a")
    cleanup()
  })
})
