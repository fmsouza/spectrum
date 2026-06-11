import { describe, expect, it } from "bun:test"
import {
  type CanonicalEvent,
  type RunState,
  initialRunState,
  reduce,
} from "@launchkit/agent-events"
import { RunnerIdSchema } from "@launchkit/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RunView } from "./RunView"

const root = RunnerIdSchema.parse("run_root")
const child = RunnerIdSchema.parse("run_child")

const state: RunState = (
  [
    { type: "runner-started", runnerId: root },
    { type: "text-delta", runnerId: root, messageId: "m1", text: "Working" },
    {
      type: "runner-started",
      runnerId: child,
      parentRunnerId: root,
      title: "sub",
    },
    {
      type: "text-delta",
      runnerId: child,
      messageId: "m2",
      text: "child says hi",
    },
  ] satisfies readonly CanonicalEvent[]
).reduce(reduce, initialRunState)

const rootRunner = state.runners.get(root)
const childRunner = state.runners.get(child)
if (rootRunner === undefined || childRunner === undefined)
  throw new Error("missing runners")

const base = {
  root: rootRunner,
  runners: state.runners,
  subBreadcrumb: ["main", "sub"],
  onOpenSubRunner: () => {},
  onCloseSub: () => {},
  onSend: () => {},
  onDecide: () => {},
}

describe("RunView", () => {
  it("renders the root timeline content", () => {
    render(<RunView {...base} />)
    expect(screen.getByText("Working")).toBeInTheDocument()
    cleanup()
  })

  it("does not render the sub-runner pane when none is open", () => {
    render(<RunView {...base} />)
    expect(screen.queryByText("child says hi")).toBeNull()
    cleanup()
  })

  it("renders the sub-runner pane content when a sub-runner is open", () => {
    render(<RunView {...base} openRunner={childRunner} />)
    expect(screen.getByText("child says hi")).toBeInTheDocument()
    cleanup()
  })

  it("forwards composer input via onSend", () => {
    let sent: string | undefined
    render(
      <RunView
        {...base}
        onSend={(t) => {
          sent = t
        }}
      />,
    )
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "next" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(sent).toBe("next")
    cleanup()
  })

  it("disables the composer when inert (replay)", () => {
    render(<RunView {...base} inert />)
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
    cleanup()
  })

  it("forwards onInterrupt to the composer stop button when busy", () => {
    let interrupted = 0
    render(
      <RunView
        {...base}
        busy
        onInterrupt={() => {
          interrupted += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Stop run" }))
    expect(interrupted).toBe(1)
    cleanup()
  })
})
