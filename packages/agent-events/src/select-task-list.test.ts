import { describe, expect, it } from "bun:test"
import { RunnerIdSchema } from "@spectrum/types"
import type { CanonicalEvent } from "./events"
import { initialRunState, reduce } from "./reduce"
import { isTodoTool, selectTaskList } from "./select-task-list"

const root = RunnerIdSchema.parse("run_root")

const fold = (events: readonly CanonicalEvent[]) =>
  events.reduce(reduce, initialRunState)

const todoCall = (callId: string, todos: unknown): CanonicalEvent => ({
  type: "tool-call-started",
  runnerId: root,
  callId,
  tool: "TodoWrite",
  input: { todos },
})

const runnerWith = (...events: readonly CanonicalEvent[]) => {
  const state = fold([{ type: "runner-started", runnerId: root }, ...events])
  const r = state.runners.get(root)
  if (r === undefined) throw new Error("missing runner")
  return r
}

const todos = [
  {
    content: "Read the layout",
    activeForm: "Reading the layout",
    status: "completed",
  },
  {
    content: "Build the rail",
    activeForm: "Building the rail",
    status: "in_progress",
  },
  { content: "Wire it up", activeForm: "Wiring it up", status: "pending" },
]

describe("isTodoTool", () => {
  it("recognizes the TodoWrite tool", () => {
    expect(isTodoTool("TodoWrite")).toBe(true)
  })
  it("rejects a non-todo tool", () => {
    expect(isTodoTool("Bash")).toBe(false)
  })
  it("is case-sensitive", () => {
    expect(isTodoTool("todowrite")).toBe(false)
  })
})

describe("selectTaskList", () => {
  it("returns undefined when the runner has no todo call", () => {
    const runner = runnerWith({
      type: "tool-call-started",
      runnerId: root,
      callId: "c1",
      tool: "Bash",
      input: { command: "ls" },
    })
    expect(selectTaskList(runner)).toBeUndefined()
  })

  it("derives the list with completed and total counts from the todo call", () => {
    const runner = runnerWith(todoCall("c1", todos))
    const list = selectTaskList(runner)
    expect(list?.total).toBe(3)
    expect(list?.completed).toBe(1)
    expect(list?.items[1]?.status).toBe("in_progress")
  })

  it("uses the latest todo call when several exist", () => {
    const runner = runnerWith(
      todoCall("c1", todos),
      todoCall("c2", [
        { content: "Only task", activeForm: "Doing it", status: "completed" },
      ]),
    )
    const list = selectTaskList(runner)
    expect(list?.total).toBe(1)
    expect(list?.completed).toBe(1)
    expect(list?.items[0]?.content).toBe("Only task")
  })

  it("returns undefined when the latest todo input is malformed", () => {
    const runner = runnerWith(todoCall("c1", "not-an-array"))
    expect(selectTaskList(runner)).toBeUndefined()
  })

  it("returns a zero-total list when todos is empty", () => {
    const runner = runnerWith(todoCall("c1", []))
    const list = selectTaskList(runner)
    expect(list?.total).toBe(0)
    expect(list?.completed).toBe(0)
  })
})
