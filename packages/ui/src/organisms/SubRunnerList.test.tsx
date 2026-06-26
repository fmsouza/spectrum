import { describe, expect, it } from "bun:test"
import {
  type CanonicalEvent,
  type RunState,
  initialRunState,
  reduce,
} from "@spectrum/agent-events"
import { RunnerIdSchema } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SubRunnerList } from "./SubRunnerList"

const root = RunnerIdSchema.parse("run_root")
const childA = RunnerIdSchema.parse("run_a")
const childB = RunnerIdSchema.parse("run_b")

// Root started, then two children spawned (A still running, B completed).
const state: RunState = (
  [
    { type: "runner-started", runnerId: root, title: "main" },
    {
      type: "runner-started",
      runnerId: childA,
      parentRunnerId: root,
      spawnedByCallId: "c1",
      title: "search docs",
    },
    {
      type: "runner-started",
      runnerId: childB,
      parentRunnerId: root,
      spawnedByCallId: "c2",
      title: "refactor module",
    },
    { type: "runner-finished", runnerId: childB, status: "completed" },
  ] satisfies readonly CanonicalEvent[]
).reduce(reduce, initialRunState)

describe("SubRunnerList", () => {
  it("renders one row per non-root runner", () => {
    render(
      <SubRunnerList
        runners={state.runners}
        rootRunnerId={root}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText("search docs")).toBeInTheDocument()
    expect(screen.getByText("refactor module")).toBeInTheDocument()
    cleanup()
  })

  it("excludes the root runner from the roster", () => {
    render(
      <SubRunnerList
        runners={state.runners}
        rootRunnerId={root}
        onOpen={() => {}}
      />,
    )
    // The root's title must not appear as a roster row. The empty-state hint
    // must not appear either (two children exist).
    expect(screen.queryByText("main")).toBeNull()
    expect(screen.queryByText(/No sub-agents/i)).toBeNull()
    cleanup()
  })

  it("derives the root from parentRunnerId when rootRunnerId is omitted", () => {
    render(<SubRunnerList runners={state.runners} onOpen={() => {}} />)
    expect(screen.getByText("search docs")).toBeInTheDocument()
    expect(screen.queryByText("main")).toBeNull()
    cleanup()
  })

  it("sorts running agents first, preserving spawn order within each group", () => {
    const { container } = render(
      <SubRunnerList
        runners={state.runners}
        rootRunnerId={root}
        onOpen={() => {}}
      />,
    )
    const titles = Array.from(
      container.querySelectorAll(".lk-sub-runner-card__title"),
    ).map((el) => el.textContent)
    // childA is running; childB completed → A first, then B.
    expect(titles).toEqual(["search docs", "refactor module"])
    cleanup()
  })

  it("shows an empty-state hint when only the root exists", () => {
    const onlyRoot: RunState = (
      [
        { type: "runner-started", runnerId: root, title: "main" },
      ] satisfies readonly CanonicalEvent[]
    ).reduce(reduce, initialRunState)
    render(
      <SubRunnerList
        runners={onlyRoot.runners}
        rootRunnerId={root}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText(/No sub-agents/i)).toBeInTheDocument()
    cleanup()
  })

  it("calls onOpen with the runner id when a row is pressed", () => {
    let opened: string | undefined
    render(
      <SubRunnerList
        runners={state.runners}
        rootRunnerId={root}
        onOpen={(id) => {
          opened = String(id)
        }}
      />,
    )
    fireEvent.click(screen.getByText("search docs"))
    expect(opened).toBe(String(childA))
    cleanup()
  })

  it("marks the focused runner's row as current", () => {
    render(
      <SubRunnerList
        runners={state.runners}
        rootRunnerId={root}
        openRunnerId={childA}
        onOpen={() => {}}
      />,
    )
    const focused = screen
      .getByText("search docs")
      .closest('li[aria-current="true"]')
    expect(focused).not.toBeNull()
    cleanup()
  })
})
