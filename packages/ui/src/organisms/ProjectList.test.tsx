import { describe, expect, it, mock } from "bun:test"
import type { Session, SessionId } from "@spectrum/types"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
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

  it("opens a context menu and emits onDeleteProject after confirming", () => {
    const onDeleteProject = mock((_id: string) => {})
    render(
      <ProjectList
        {...baseProps}
        onDeleteProject={onDeleteProject}
        onDeleteSession={() => {}}
      />,
    )
    fireEvent.contextMenu(screen.getByRole("button", { name: /api/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete project" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete project" }),
    )
    expect(onDeleteProject).toHaveBeenCalledWith("prj_a")
    cleanup()
  })

  it("opens a session context menu and emits onDeleteSession after confirming", () => {
    const onDeleteSession = mock((_id: SessionId) => {})
    render(
      <ProjectList
        {...baseProps}
        onDeleteProject={() => {}}
        onDeleteSession={onDeleteSession}
      />,
    )
    fireEvent.contextMenu(screen.getByText("s1"))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete session" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete session" }),
    )
    expect(onDeleteSession).toHaveBeenCalledWith("s1")
    cleanup()
  })

  it("does not call onDelete and closes the dialog when cancelling", () => {
    const onDeleteProject = mock((_id: string) => {})
    render(
      <ProjectList
        {...baseProps}
        onDeleteProject={onDeleteProject}
        onDeleteSession={() => {}}
      />,
    )
    fireEvent.contextMenu(screen.getByRole("button", { name: /api/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete project" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onDeleteProject).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
    cleanup()
  })

  it("does not open a context menu when onDelete props are omitted", () => {
    render(<ProjectList {...baseProps} />)
    fireEvent.contextMenu(screen.getByRole("button", { name: /api/ }))
    expect(
      screen.queryByRole("menuitem", { name: "Delete project" }),
    ).toBeNull()
    fireEvent.contextMenu(screen.getByText("s1"))
    expect(
      screen.queryByRole("menuitem", { name: "Delete session" }),
    ).toBeNull()
    cleanup()
  })
})
