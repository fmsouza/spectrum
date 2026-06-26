import { describe, expect, it } from "bun:test"
import {
  type CanonicalEvent,
  type RunState,
  initialRunState,
  reduce,
} from "@spectrum/agent-events"
import { RunnerIdSchema } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SubRunnerPane } from "./SubRunnerPane"

const child = RunnerIdSchema.parse("run_child")

const state: RunState = (
  [
    { type: "runner-started", runnerId: child, title: "search docs" },
    { type: "text-delta", runnerId: child, messageId: "m1", text: "looking…" },
  ] satisfies readonly CanonicalEvent[]
).reduce(reduce, initialRunState)

const runner = state.runners.get(child)
if (runner === undefined) throw new Error("no child runner")

describe("SubRunnerPane", () => {
  it("renders the breadcrumb path", () => {
    render(
      <SubRunnerPane
        runner={runner}
        runners={state.runners}
        breadcrumb={["main", "search docs"]}
        onOpenSubRunner={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/main/)).toBeInTheDocument()
    expect(screen.getByText(/search docs/)).toBeInTheDocument()
    cleanup()
  })

  it("renders a read-only marker", () => {
    render(
      <SubRunnerPane
        runner={runner}
        runners={state.runners}
        breadcrumb={["main", "search docs"]}
        onOpenSubRunner={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Read-only/i)).toBeInTheDocument()
    cleanup()
  })

  it("renders the child runner's timeline content", () => {
    render(
      <SubRunnerPane
        runner={runner}
        runners={state.runners}
        breadcrumb={["main", "search docs"]}
        onOpenSubRunner={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText("looking…")).toBeInTheDocument()
    cleanup()
  })

  it("calls onClose when the back affordance is clicked", () => {
    let closed = false
    render(
      <SubRunnerPane
        runner={runner}
        runners={state.runners}
        breadcrumb={["main", "search docs"]}
        onOpenSubRunner={() => {}}
        onClose={() => {
          closed = true
        }}
      />,
    )
    // Regression guard: the single back affordance replaces what used to be
    // two close-like controls (the ✕ and a parallel "Back to agents"). Make
    // sure no close-shaped button re-appears.
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Back to agents/i }))
    expect(closed).toBe(true)
    cleanup()
  })
})
