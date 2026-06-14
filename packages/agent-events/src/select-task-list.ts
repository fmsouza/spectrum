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

/**
 * Task-management tools. Their calls are bookkeeping noise in the conversation (suppressed by the
 * timeline) and their cumulative effect is surfaced in the side rail. Two families today:
 *  - Claude's `TodoWrite` — each call carries the full list snapshot in `input.todos`.
 *  - The `TaskCreate` / `TaskUpdate` / `TaskList` family (agent/MCP task tools) — incremental:
 *    `TaskCreate` appends a task, `TaskUpdate` mutates one by its 1-based id, `TaskList` is a
 *    read-only snapshot (tasks are sourced from create/update, so it has no selection effect).
 * NOTE: the sub-agent spawn tool is named `Task` (no suffix) — deliberately NOT in this set, so its
 * sub-runner cards are never suppressed.
 */
const TASK_TOOLS: ReadonlySet<string> = new Set([
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
])

/** True when a tool-call's tool name is a recognized task tool. Reused for timeline suppression. */
export const isTaskTool = (tool: string): boolean => TASK_TOOLS.has(tool)

/** A task being folded; carries the harness id so a later `TaskUpdate` can target it. */
type WorkingTask = TaskItem & { id: string }

const STATUS_ALIASES: Readonly<Record<string, TaskStatus>> = {
  pending: "pending",
  todo: "pending",
  open: "pending",
  in_progress: "in_progress",
  "in-progress": "in_progress",
  "in progress": "in_progress",
  active: "in_progress",
  running: "in_progress",
  doing: "in_progress",
  completed: "completed",
  complete: "completed",
  done: "completed",
}

/** Map a free-form harness status string to a canonical TaskStatus (unknown → "pending"). */
const normalizeStatus = (raw: unknown): TaskStatus => {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  return STATUS_ALIASES[key] ?? "pending"
}

const TodoInputSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string(),
      activeForm: z.string(),
      status: TaskStatusSchema,
    }),
  ),
})
const TaskCreateInputSchema = z.object({ subject: z.string() })
const TaskUpdateInputSchema = z.object({
  taskId: z.union([z.string(), z.number()]),
  status: z.string(),
})

/**
 * Derive the current task list for a runner by folding its task-tool calls in timeline order. PURE.
 * Returns undefined when the runner used no task tool that produced tasks.
 */
export const selectTaskList = (runner: RunnerState): TaskList | undefined => {
  let tasks: WorkingTask[] = []
  let touched = false

  for (const item of runner.items) {
    if (item.kind !== "tool-call" || !isTaskTool(item.tool)) continue
    switch (item.tool) {
      case "TodoWrite": {
        // Snapshot semantics: each TodoWrite call carries the full list — replace.
        const parsed = TodoInputSchema.safeParse(item.input)
        if (!parsed.success) break
        tasks = parsed.data.todos.map((t, i) => ({ id: String(i + 1), ...t }))
        touched = true
        break
      }
      case "TaskCreate": {
        const parsed = TaskCreateInputSchema.safeParse(item.input)
        if (!parsed.success) break
        tasks = [
          ...tasks,
          {
            id: String(tasks.length + 1),
            content: parsed.data.subject,
            activeForm: parsed.data.subject,
            status: "pending",
          },
        ]
        touched = true
        break
      }
      case "TaskUpdate": {
        const parsed = TaskUpdateInputSchema.safeParse(item.input)
        if (!parsed.success) break
        const id = String(parsed.data.taskId)
        const next = normalizeStatus(parsed.data.status)
        tasks = tasks.map((t) => (t.id === id ? { ...t, status: next } : t))
        touched = true
        break
      }
      case "TaskList":
        // Read-only snapshot; tasks come from create/update. Listed in TASK_TOOLS only so the
        // timeline suppresses its card — no selection effect here.
        break
    }
  }

  if (!touched) return undefined
  const items: TaskItem[] = tasks.map(({ content, activeForm, status }) => ({
    content,
    activeForm,
    status,
  }))
  const completed = items.filter((t) => t.status === "completed").length
  return { items, completed, total: items.length }
}
