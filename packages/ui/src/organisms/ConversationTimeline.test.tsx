import { describe, expect, it } from "bun:test"
import {
  type CanonicalEvent,
  type RunState,
  initialRunState,
  reduce,
} from "@spectrum/agent-events"
import { RunnerIdSchema } from "@spectrum/types"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConversationTimeline } from "./ConversationTimeline"

const root = RunnerIdSchema.parse("run_root")
const child = RunnerIdSchema.parse("run_child")

const fold = (events: readonly CanonicalEvent[]): RunState =>
  events.reduce(reduce, initialRunState)

const baseEvents: readonly CanonicalEvent[] = [
  { type: "runner-started", runnerId: root },
  { type: "text-delta", runnerId: root, messageId: "m1", text: "Hello" },
  { type: "tool-call-started", runnerId: root, callId: "c1", tool: "Bash" },
  {
    type: "tool-call-finished",
    runnerId: root,
    callId: "c1",
    status: "ok",
    output: "done",
  },
  {
    type: "approval-requested",
    runnerId: root,
    requestId: "rq1",
    target: { kind: "command", detail: "rm -rf build" },
  },
]

describe("ConversationTimeline", () => {
  it("renders an assistant message from a text-delta", () => {
    const state = fold(baseEvents)
    const runner = state.runners.get(root)
    if (runner === undefined) throw new Error("no root runner")
    render(
      <ConversationTimeline
        runner={runner}
        runners={state.runners}
        onOpenSubRunner={() => {}}
        onDecide={() => {}}
      />,
    )
    expect(screen.getByText("Hello")).toBeInTheDocument()
    cleanup()
  })

  it("renders the message a turn error references in its error state", () => {
    const state = fold([
      { type: "runner-started", runnerId: root },
      {
        type: "text-delta",
        runnerId: root,
        messageId: "m1",
        text: "API Error: 429 you have reached your session usage limit",
      },
      {
        type: "turn-finished",
        runnerId: root,
        error: {
          detail: "API Error: 429 you have reached your session usage limit",
          messageId: "m1",
        },
      },
    ])
    const runner = state.runners.get(root)
    if (runner === undefined) throw new Error("no root runner")
    const { container } = render(
      <ConversationTimeline
        runner={runner}
        runners={state.runners}
        onOpenSubRunner={() => {}}
        onDecide={() => {}}
      />,
    )
    expect(
      container.querySelector('.lk-message-bubble[data-tone="error"]'),
    ).not.toBeNull()
    cleanup()
  })

  it("renders a tool call card for a finished tool call", () => {
    const state = fold(baseEvents)
    const runner = state.runners.get(root)
    if (runner === undefined) throw new Error("no root runner")
    render(
      <ConversationTimeline
        runner={runner}
        runners={state.runners}
        onOpenSubRunner={() => {}}
        onDecide={() => {}}
      />,
    )
    expect(screen.getByTestId("tool-call-c1")).toBeInTheDocument()
    cleanup()
  })

  it("renders an inline approval card and forwards a decision", () => {
    const state = fold(baseEvents)
    const runner = state.runners.get(root)
    if (runner === undefined) throw new Error("no root runner")
    let decided: string | undefined
    render(
      <ConversationTimeline
        runner={runner}
        runners={state.runners}
        onOpenSubRunner={() => {}}
        onDecide={(rq, d) => {
          decided = `${rq}:${d}`
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(decided).toBe("rq1:allow")
    cleanup()
  })

  it("renders a sub-runner card for a tool call that spawned a runner and forwards open", () => {
    const events: readonly CanonicalEvent[] = [
      { type: "runner-started", runnerId: root },
      { type: "tool-call-started", runnerId: root, callId: "c9", tool: "Task" },
      {
        type: "runner-started",
        runnerId: child,
        parentRunnerId: root,
        spawnedByCallId: "c9",
        title: "search docs",
      },
    ]
    const state = fold(events)
    const runner = state.runners.get(root)
    if (runner === undefined) throw new Error("no root runner")
    let opened: string | undefined
    render(
      <ConversationTimeline
        runner={runner}
        runners={state.runners}
        onOpenSubRunner={(id) => {
          opened = id
        }}
        onDecide={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /search docs/ }))
    expect(opened).toBe(child)
    cleanup()
  })
})
