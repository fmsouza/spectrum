import { describe, expect, it } from "bun:test"
import {
  type CanonicalEvent,
  type RunState,
  type TaskList,
  initialRunState,
  reduce,
} from "@spectrum/agent-events"
import { RunnerIdSchema } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RunSideRail } from "./RunSideRail"

const child = RunnerIdSchema.parse("run_child")

const state: RunState = (
  [
    { type: "runner-started", runnerId: child, title: "sub" },
    {
      type: "text-delta",
      runnerId: child,
      messageId: "m1",
      text: "child says hi",
    },
  ] satisfies readonly CanonicalEvent[]
).reduce(reduce, initialRunState)

const childRunner = state.runners.get(child)
if (childRunner === undefined) throw new Error("missing child")

const rootList: TaskList = {
  items: [
    { content: "Root task", activeForm: "Doing root", status: "pending" },
  ],
  completed: 0,
  total: 1,
}
const subList: TaskList = {
  items: [{ content: "Sub task", activeForm: "Doing sub", status: "pending" }],
  completed: 0,
  total: 1,
}

const base = {
  runners: state.runners,
  subBreadcrumb: ["main", "sub"],
  onOpenSubRunner: () => {},
  onCloseSub: () => {},
}

const containerFirstChildIsStrip = (): boolean => {
  // The collapsed strip is <aside class="lk-side-rail lk-side-rail--collapsed">.
  const aside = document.querySelector("aside.lk-side-rail--collapsed")
  return aside !== null
}

describe("RunSideRail", () => {
  it("renders the collapsed strip (not nothing) when there is no task list and no sub-runner", () => {
    render(<RunSideRail {...base} collapsed />)
    expect(containerFirstChildIsStrip()).toBe(true)
    expect(
      screen.getByRole("button", { name: "Expand tasks panel" }),
    ).toBeInTheDocument()
    cleanup()
  })

  it("shows disabled vertical Tasks and Sub-agent buttons on the collapsed strip when empty", () => {
    render(<RunSideRail {...base} collapsed />)
    expect(screen.getByRole("button", { name: /^Tasks/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^Sub-agent/ })).toBeDisabled()
    cleanup()
  })

  it("enables the vertical Tasks button when a root task list is present", () => {
    render(<RunSideRail {...base} rootTaskList={rootList} collapsed />)
    expect(screen.getByRole("button", { name: /^Tasks/ })).not.toBeDisabled()
    // Still no sub-runner → Sub-agent stays disabled.
    expect(screen.getByRole("button", { name: /^Sub-agent/ })).toBeDisabled()
    cleanup()
  })

  it("enables the vertical Sub-agent button when a sub-runner is open", () => {
    render(
      <RunSideRail
        {...base}
        subRunner={childRunner}
        subTaskList={subList}
        collapsed
      />,
    )
    expect(
      screen.getByRole("button", { name: /^Sub-agent/ }),
    ).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /^Tasks/ })).not.toBeDisabled()
    cleanup()
  })

  it("expands and selects Tasks when the vertical Tasks button is pressed", () => {
    let toggled = 0
    render(
      <RunSideRail
        {...base}
        rootTaskList={rootList}
        collapsed
        onToggleCollapsed={() => {
          toggled += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^Tasks/ }))
    expect(toggled).toBe(1)
    cleanup()
  })

  it("expands and selects Sub-agent when the vertical Sub-agent button is pressed", () => {
    let toggled = 0
    render(
      <RunSideRail
        {...base}
        subRunner={childRunner}
        subTaskList={subList}
        collapsed
        onToggleCollapsed={() => {
          toggled += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^Sub-agent/ }))
    expect(toggled).toBe(1)
    cleanup()
  })

  it("shows the root task rail when root has tasks and no sub is open", () => {
    render(<RunSideRail {...base} rootTaskList={rootList} />)
    expect(screen.getByText("Root task")).toBeInTheDocument()
    // Header is present with Sub-agent disabled.
    expect(screen.getByRole("tab", { name: "Sub-agent" })).toBeDisabled()
    cleanup()
  })

  it("shows the Tasks/Sub-agent header even when only root tasks exist (no sub open)", () => {
    render(<RunSideRail {...base} rootTaskList={rootList} />)
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Sub-agent" })).toBeDisabled()
    expect(screen.getByText("Root task")).toBeInTheDocument()
    cleanup()
  })

  it("disables the Tasks tab and enables Sub-agent when a sub-runner has no tasks", () => {
    render(<RunSideRail {...base} subRunner={childRunner} />)
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeDisabled()
    expect(screen.getByRole("tab", { name: "Sub-agent" })).not.toBeDisabled()
    cleanup()
  })

  it("shows the root task list under Tasks when no sub is open", () => {
    render(<RunSideRail {...base} rootTaskList={rootList} />)
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }))
    expect(screen.getByText("Root task")).toBeInTheDocument()
    cleanup()
  })

  it("defaults to the Sub-agent segment when a sub-runner is open", () => {
    render(
      <RunSideRail
        {...base}
        rootTaskList={rootList}
        subRunner={childRunner}
        subTaskList={subList}
      />,
    )
    expect(screen.getByText("child says hi")).toBeInTheDocument()
    expect(screen.queryByText("Sub task")).toBeNull()
    cleanup()
  })

  it("switches to the focused sub-runner's tasks when the Tasks tab is clicked", () => {
    render(
      <RunSideRail
        {...base}
        rootTaskList={rootList}
        subRunner={childRunner}
        subTaskList={subList}
      />,
    )
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }))
    expect(screen.getByText("Sub task")).toBeInTheDocument()
    expect(screen.queryByText("Root task")).toBeNull()
    cleanup()
  })

  it("disables the Tasks tab when the open sub-runner has no tasks", () => {
    render(<RunSideRail {...base} subRunner={childRunner} />)
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeDisabled()
    expect(screen.getByText("child says hi")).toBeInTheDocument()
    cleanup()
  })

  it("reduces to a thin strip with an expand control when collapsed", () => {
    render(<RunSideRail {...base} rootTaskList={rootList} collapsed />)
    // The task rows are hidden; only the expand control + count remain.
    expect(screen.queryByText("Root task")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Expand tasks panel" }),
    ).toBeInTheDocument()
    cleanup()
  })

  it("invokes onToggleCollapsed from the expand control", () => {
    let toggled = false
    render(
      <RunSideRail
        {...base}
        rootTaskList={rootList}
        collapsed
        onToggleCollapsed={() => {
          toggled = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Expand tasks panel" }))
    expect(toggled).toBe(true)
    cleanup()
  })

  it("invokes onToggleCollapsed from the task-rail collapse control", () => {
    let toggled = false
    render(
      <RunSideRail
        {...base}
        rootTaskList={rootList}
        onToggleCollapsed={() => {
          toggled = true
        }}
      />,
    )
    // The unified expanded structure has two collapse controls (segment header
    // + TaskRail's own button). This test targets the TaskRail one specifically.
    const taskRailCollapse = document.querySelector(".lk-task-rail__collapse")
    if (taskRailCollapse === null) throw new Error("missing task-rail collapse")
    fireEvent.click(taskRailCollapse)
    expect(toggled).toBe(true)
    cleanup()
  })
})
