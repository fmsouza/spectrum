import { z } from "zod"
import type { RunnerState } from "./reduce"

const TaskStatusSchema = z.enum(["pending", "in_progress", "completed"])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export type TaskItem = {
  content: string
  activeForm: string
  status: TaskStatus
}

export type TaskList = {
  items: readonly TaskItem[]
  completed: number
  total: number
}

/** Harness todo-tool names. Only Claude's TodoWrite exists today; extend as drivers add task tools. */
const TODO_TOOLS: ReadonlySet<string> = new Set(["TodoWrite"])

/** True when a tool-call's tool name is a recognized todo/task tool. Reused for timeline suppression. */
export const isTodoTool = (tool: string): boolean => TODO_TOOLS.has(tool)

const TaskItemSchema = z.object({
  content: z.string(),
  activeForm: z.string(),
  status: TaskStatusSchema,
})
const TodoInputSchema = z.object({ todos: z.array(TaskItemSchema) })

/**
 * Derive the current task list from a runner by parsing the LATEST recognized todo tool-call's input.
 * Returns undefined when there is no todo call or its input is malformed. PURE.
 */
export const selectTaskList = (runner: RunnerState): TaskList | undefined => {
  for (let i = runner.items.length - 1; i >= 0; i--) {
    const item = runner.items[i]
    if (item === undefined) continue
    if (item.kind === "tool-call" && isTodoTool(item.tool)) {
      const parsed = TodoInputSchema.safeParse(item.input)
      if (!parsed.success) return undefined
      const items = parsed.data.todos
      const completed = items.filter((t) => t.status === "completed").length
      return { items, completed, total: items.length }
    }
  }
  return undefined
}
