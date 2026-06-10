import type { RunnerId } from "@launchkit/types"
import type {
  ApprovalDecision,
  ApprovalTarget,
  CanonicalEvent,
  Json,
  Usage,
} from "./events"

export type RunnerStatus = "running" | "completed" | "errored" | "interrupted"

export type MessageItem = {
  kind: "message"
  messageId: string
  role: "user" | "assistant"
  text: string
}
export type ReasoningItem = {
  kind: "reasoning"
  messageId: string
  text: string
}
export type ToolCallItem = {
  kind: "tool-call"
  callId: string
  tool: string
  input?: Json
  status: "running" | "ok" | "error"
  output?: string
  exitCode?: number
  result?: Json
  spawnedRunnerId?: RunnerId
}
export type FileChangeItem = {
  kind: "file-change"
  callId?: string
  path: string
  changeKind: "add" | "update" | "delete"
  diff?: string
}
export type ApprovalItem = {
  kind: "approval"
  requestId: string
  target: ApprovalTarget
  decision?: ApprovalDecision
  by?: "user" | "policy"
}
export type TimelineItem =
  | MessageItem
  | ReasoningItem
  | ToolCallItem
  | FileChangeItem
  | ApprovalItem

export type RunnerState = {
  id: RunnerId
  parentRunnerId?: RunnerId
  agentType?: string
  title?: string
  status: RunnerStatus
  items: TimelineItem[]
  usage?: Usage
}
export type RunState = {
  rootRunnerId?: RunnerId
  runners: ReadonlyMap<RunnerId, RunnerState>
}

export const initialRunState: RunState = { runners: new Map() }

/** Return a new RunState with `runner` replacing whatever is at `runner.id`. */
const withRunner = (state: RunState, runner: RunnerState): RunState => {
  const runners = new Map(state.runners)
  runners.set(runner.id, runner)
  return { ...state, runners }
}

/** Apply a pure transform to one runner's items, returning a new RunState. */
const mapRunnerItems = (
  state: RunState,
  runnerId: RunnerId,
  transform: (items: TimelineItem[]) => TimelineItem[],
): RunState => {
  const runner = state.runners.get(runnerId)
  if (runner === undefined) return state
  return withRunner(state, { ...runner, items: transform(runner.items) })
}

export const reduce = (state: RunState, event: CanonicalEvent): RunState => {
  switch (event.type) {
    case "runner-started": {
      // `event.model` is intentionally not projected into RunnerState; it is
      // retained only in the StoredEvent envelope for audit / replay purposes.
      // Idempotent re-emit: the runtime marks the root runner started up front and the harness
      // may emit its own `runner-started` afterwards (e.g. claude's system/init). Preserve any
      // items/title already accumulated so the in-flight conversation is not reset to empty.
      const existing = state.runners.get(event.runnerId)
      const title = event.title ?? existing?.title
      const agentType = event.agentType ?? existing?.agentType
      const parentRunnerId = event.parentRunnerId ?? existing?.parentRunnerId
      const runner: RunnerState = {
        id: event.runnerId,
        status: "running",
        items: existing?.items ?? [],
        ...(parentRunnerId !== undefined ? { parentRunnerId } : {}),
        ...(agentType !== undefined ? { agentType } : {}),
        ...(title !== undefined ? { title } : {}),
      }
      let next = withRunner(state, runner)
      if (
        event.parentRunnerId === undefined &&
        next.rootRunnerId === undefined
      ) {
        next = { ...next, rootRunnerId: event.runnerId }
      }
      if (
        event.parentRunnerId !== undefined &&
        event.spawnedByCallId !== undefined
      ) {
        const callId = event.spawnedByCallId
        next = mapRunnerItems(next, event.parentRunnerId, (items) =>
          items.map((item) =>
            item.kind === "tool-call" && item.callId === callId
              ? { ...item, spawnedRunnerId: event.runnerId }
              : item,
          ),
        )
      }
      return next
    }

    case "runner-finished": {
      const runner = state.runners.get(event.runnerId)
      if (runner === undefined) return state
      // `event.error` is intentionally not projected into RunnerState; it is
      // retained only in the StoredEvent envelope for audit / replay purposes.
      return withRunner(state, { ...runner, status: event.status })
    }

    case "text-delta":
      return mapRunnerItems(state, event.runnerId, (items) => {
        const idx = items.findIndex(
          (i) => i.kind === "message" && i.messageId === event.messageId,
        )
        if (idx === -1) {
          return [
            ...items,
            {
              kind: "message",
              messageId: event.messageId,
              role: event.role ?? "assistant",
              text: event.text,
            },
          ]
        }
        const existing = items[idx] as MessageItem
        const updated: MessageItem = {
          ...existing,
          text: existing.text + event.text,
        }
        return items.map((i, j) => (j === idx ? updated : i))
      })

    case "reasoning-delta":
      return mapRunnerItems(state, event.runnerId, (items) => {
        const idx = items.findIndex(
          (i) => i.kind === "reasoning" && i.messageId === event.messageId,
        )
        if (idx === -1) {
          return [
            ...items,
            { kind: "reasoning", messageId: event.messageId, text: event.text },
          ]
        }
        const existing = items[idx] as ReasoningItem
        const updated: ReasoningItem = {
          ...existing,
          text: existing.text + event.text,
        }
        return items.map((i, j) => (j === idx ? updated : i))
      })

    case "tool-call-started":
      return mapRunnerItems(state, event.runnerId, (items) => [
        ...items,
        {
          kind: "tool-call",
          callId: event.callId,
          tool: event.tool,
          status: "running",
          ...(event.input !== undefined ? { input: event.input } : {}),
        },
      ])

    case "tool-output-delta":
      return mapRunnerItems(state, event.runnerId, (items) =>
        items.map((item) =>
          item.kind === "tool-call" && item.callId === event.callId
            ? { ...item, output: (item.output ?? "") + event.chunk }
            : item,
        ),
      )

    case "tool-call-finished":
      return mapRunnerItems(state, event.runnerId, (items) =>
        items.map((item) =>
          item.kind === "tool-call" && item.callId === event.callId
            ? {
                ...item,
                status: event.status,
                ...(event.output !== undefined ? { output: event.output } : {}),
                ...(event.exitCode !== undefined
                  ? { exitCode: event.exitCode }
                  : {}),
                ...(event.result !== undefined ? { result: event.result } : {}),
              }
            : item,
        ),
      )

    case "file-change":
      return mapRunnerItems(state, event.runnerId, (items) => [
        ...items,
        {
          kind: "file-change",
          path: event.path,
          changeKind: event.kind,
          ...(event.callId !== undefined ? { callId: event.callId } : {}),
          ...(event.diff !== undefined ? { diff: event.diff } : {}),
        },
      ])

    case "approval-requested":
      return mapRunnerItems(state, event.runnerId, (items) => [
        ...items,
        { kind: "approval", requestId: event.requestId, target: event.target },
      ])

    case "approval-resolved":
      return mapRunnerItems(state, event.runnerId, (items) =>
        items.map((item) =>
          item.kind === "approval" && item.requestId === event.requestId
            ? { ...item, decision: event.decision, by: event.by }
            : item,
        ),
      )

    case "usage": {
      const runner = state.runners.get(event.runnerId)
      if (runner === undefined) return state
      return withRunner(state, { ...runner, usage: event.usage })
    }

    case "turn-finished": {
      if (event.usage === undefined) return state
      const runner = state.runners.get(event.runnerId)
      if (runner === undefined) return state
      return withRunner(state, { ...runner, usage: event.usage })
    }

    case "annotation":
      return state

    default:
      return state
  }
}
