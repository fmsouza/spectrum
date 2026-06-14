import { describe, expect, it } from "bun:test"
import { RunnerIdSchema } from "@spectrum/types"
import type { CanonicalEvent } from "./events"
import { initialRunState, reduce } from "./reduce"
import { isTaskTool, selectTaskList } from "./select-task-list"

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

const taskCreate = (callId: string, subject: string): CanonicalEvent => ({
  type: "tool-call-started",
  runnerId: root,
  callId,
  tool: "TaskCreate",
  input: { subject },
})

const taskUpdate = (
  callId: string,
  taskId: string,
  status: string,
): CanonicalEvent => ({
  type: "tool-call-started",
  runnerId: root,
  callId,
  tool: "TaskUpdate",
  input: { taskId, status },
})

const taskList = (callId: string): CanonicalEvent => ({
  type: "tool-call-started",
  runnerId: root,
  callId,
  tool: "TaskList",
  input: {},
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

describe("isTaskTool", () => {
  it("recognizes the TodoWrite tool", () => {
    expect(isTaskTool("TodoWrite")).toBe(true)
  })
  it("recognizes the TaskCreate/TaskUpdate/TaskList family", () => {
    expect(isTaskTool("TaskCreate")).toBe(true)
    expect(isTaskTool("TaskUpdate")).toBe(true)
    expect(isTaskTool("TaskList")).toBe(true)
  })
  it("rejects a non-task tool", () => {
    expect(isTaskTool("Bash")).toBe(false)
  })
  it("does not match the sub-agent spawn tool 'Task'", () => {
    expect(isTaskTool("Task")).toBe(false)
  })
  it("is case-sensitive", () => {
    expect(isTaskTool("taskcreate")).toBe(false)
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

describe("selectTaskList — TaskCreate/TaskUpdate family", () => {
  it("builds the list from TaskCreate calls", () => {
    const runner = runnerWith(
      taskCreate("c1", "First task"),
      taskCreate("c2", "Second task"),
    )
    const list = selectTaskList(runner)
    expect(list?.total).toBe(2)
    expect(list?.completed).toBe(0)
    expect(list?.items[0]?.content).toBe("First task")
    expect(list?.items[1]?.status).toBe("pending")
  })

  it("applies TaskUpdate status changes by 1-based taskId", () => {
    const runner = runnerWith(
      taskCreate("c1", "One"),
      taskCreate("c2", "Two"),
      taskCreate("c3", "Three"),
      taskUpdate("c4", "1", "in_progress"),
      taskUpdate("c5", "2", "completed"),
    )
    const list = selectTaskList(runner)
    expect(list?.total).toBe(3)
    expect(list?.completed).toBe(1)
    expect(list?.items[0]?.status).toBe("in_progress")
    expect(list?.items[1]?.status).toBe("completed")
    expect(list?.items[2]?.status).toBe("pending")
  })

  it("reflects the latest status when a task is updated twice", () => {
    const runner = runnerWith(
      taskCreate("c1", "One"),
      taskUpdate("c2", "1", "in_progress"),
      taskUpdate("c3", "1", "completed"),
    )
    const list = selectTaskList(runner)
    expect(list?.items[0]?.status).toBe("completed")
    expect(list?.completed).toBe(1)
  })

  it("ignores a TaskUpdate for an unknown taskId", () => {
    const runner = runnerWith(
      taskCreate("c1", "One"),
      taskUpdate("c2", "9", "completed"),
    )
    const list = selectTaskList(runner)
    expect(list?.total).toBe(1)
    expect(list?.items[0]?.status).toBe("pending")
  })

  it("uses the TaskCreate subject as both content and activeForm", () => {
    const runner = runnerWith(taskCreate("c1", "Do the thing"))
    const list = selectTaskList(runner)
    expect(list?.items[0]?.content).toBe("Do the thing")
    expect(list?.items[0]?.activeForm).toBe("Do the thing")
  })

  it("does not derive a list from a read-only TaskList call alone", () => {
    // TaskList is suppressed from the timeline but is a read; tasks come from TaskCreate.
    const runner = runnerWith(taskList("c1"))
    expect(selectTaskList(runner)).toBeUndefined()
  })

  it("derives from creates even when a TaskList read is interleaved", () => {
    const runner = runnerWith(
      taskCreate("c1", "Alpha"),
      taskList("c2"),
      taskUpdate("c3", "1", "completed"),
    )
    const list = selectTaskList(runner)
    expect(list?.total).toBe(1)
    expect(list?.items[0]?.status).toBe("completed")
  })

  it("normalizes harness status aliases (e.g. 'in-progress', 'done')", () => {
    const runner = runnerWith(
      taskCreate("c1", "One"),
      taskCreate("c2", "Two"),
      taskUpdate("c3", "1", "in-progress"),
      taskUpdate("c4", "2", "done"),
    )
    const list = selectTaskList(runner)
    expect(list?.items[0]?.status).toBe("in_progress")
    expect(list?.items[1]?.status).toBe("completed")
  })
})
