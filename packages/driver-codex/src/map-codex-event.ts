import type { CanonicalEvent, RunnerId } from "@launchkit/agent-events"
import type { CodexServerNotification, CodexThreadItem } from "./protocol"

/**
 * Small mutable mapping state threaded across notifications. The maps correlate codex's stringly
 * ids to OUR canonical ids:
 * - `messageIds`: agentMessage/reasoning `itemId` → canonical `messageId`.
 * - `callIds`: commandExecution/fileChange `itemId` → canonical `callId`.
 * - `runnerIds`: codex `threadId` → canonical `RunnerId` (the root thread is implicit via
 *   `rootRunnerId`; collab children register their receiver threadId here).
 * The `new*`/`next*` minters are injected (the adapter wires `ctx.newRunnerId` + `idGen`); tests
 * pass sequential stubs.
 */
export interface CodexMapState {
  readonly rootRunnerId: RunnerId
  readonly messageIds: Map<string, string>
  readonly callIds: Map<string, string>
  readonly runnerIds: Map<string, RunnerId>
  newRunnerId: () => RunnerId
  newCallId: () => string
  nextMessageId: () => string
}

/** Resolve which runner a codex `threadId` belongs to (root unless a collab child owns it). */
const runnerFor = (threadId: string, state: CodexMapState): RunnerId =>
  state.runnerIds.get(threadId) ?? state.rootRunnerId

/** Get (or mint + register) the canonical messageId for a message/reasoning itemId. */
const messageIdFor = (itemId: string, state: CodexMapState): string => {
  const existing = state.messageIds.get(itemId)
  if (existing !== undefined) return existing
  const minted = state.nextMessageId()
  state.messageIds.set(itemId, minted)
  return minted
}

/** Get (or mint + register) the canonical callId for a tool itemId. */
const callIdFor = (itemId: string, state: CodexMapState): string => {
  const existing = state.callIds.get(itemId)
  if (existing !== undefined) return existing
  const minted = state.newCallId()
  state.callIds.set(itemId, minted)
  return minted
}

/** Map a codex PatchChangeKind to the canonical file-change kind. */
const patchKind = (kind: { readonly type: string }):
  | "add"
  | "update"
  | "delete" =>
  kind.type === "add" ? "add" : kind.type === "delete" ? "delete" : "update"

/** Map an item that STARTED (item/started). Returns events + mutates correlation state. */
const onItemStarted = (
  item: CodexThreadItem,
  runnerId: RunnerId,
  state: CodexMapState,
): readonly CanonicalEvent[] => {
  switch (item.type) {
    case "agentMessage":
    case "reasoning": {
      // Register itemId → messageId; deltas reference it. No event on start.
      messageIdFor(item.id, state)
      return []
    }
    case "commandExecution": {
      const callId = callIdFor(item.id, state)
      return [
        {
          type: "tool-call-started",
          runnerId,
          callId,
          tool: "shell",
          input: { command: item.command, cwd: String(item.cwd) },
        },
      ]
    }
    case "collabAgentToolCall": {
      if (item.tool !== "spawnAgent") return []
      const childThreadId = item.receiverThreadIds[0]
      if (childThreadId === undefined) return []
      const child = state.newRunnerId()
      state.runnerIds.set(childThreadId, child)
      return [
        {
          type: "runner-started",
          runnerId: child,
          parentRunnerId: state.rootRunnerId,
          spawnedByCallId: item.id,
          agentType: "codex-subagent",
        },
      ]
    }
    default:
      // Unknown / not-yet-handled item types are ignored defensively (app-server is experimental).
      return []
  }
}

/** Map an item that COMPLETED (item/completed). Returns events + mutates correlation state. */
const onItemCompleted = (
  item: CodexThreadItem,
  runnerId: RunnerId,
  state: CodexMapState,
): readonly CanonicalEvent[] => {
  switch (item.type) {
    case "commandExecution": {
      const callId = callIdFor(item.id, state)
      const ok = item.status === "completed"
      const exitCode = item.exitCode
      return [
        {
          type: "tool-call-finished",
          runnerId,
          callId,
          status: ok ? "ok" : "error",
          output: item.aggregatedOutput ?? "",
          ...(exitCode !== null ? { exitCode } : {}),
        },
      ]
    }
    case "fileChange": {
      const callId = state.callIds.get(item.id)
      return item.changes.map((change) => ({
        type: "file-change",
        runnerId,
        ...(callId !== undefined ? { callId } : {}),
        path: change.path,
        kind: patchKind(change.kind),
        diff: change.diff,
      }))
    }
    default:
      return []
  }
}

/**
 * PURE: map one `codex app-server` server notification to 0..n canonical events, threading + mutating
 * the small correlation `state`. Unknown methods/items never throw — they map to `[]`.
 */
export const mapCodexEvent = (
  notif: CodexServerNotification,
  state: CodexMapState,
): readonly CanonicalEvent[] => {
  switch (notif.method) {
    case "thread/started":
    case "turn/started":
      return []
    case "turn/completed": {
      const { threadId, turn } = notif.params
      const runnerId = runnerFor(threadId, state)
      switch (turn.status) {
        case "completed":
          return [{ type: "runner-finished", runnerId, status: "completed" }]
        case "interrupted":
          return [{ type: "runner-finished", runnerId, status: "interrupted" }]
        case "failed":
          return [
            {
              type: "runner-finished",
              runnerId,
              status: "errored",
              ...(turn.error?.message !== undefined
                ? { error: turn.error.message }
                : {}),
            },
          ]
        default:
          return []
      }
    }
    case "thread/tokenUsage/updated": {
      const last = notif.params.tokenUsage.last
      return [
        {
          type: "usage",
          runnerId: runnerFor(notif.params.threadId, state),
          usage: {
            inputTokens: last.inputTokens,
            outputTokens: last.outputTokens,
            cachedInputTokens: last.cachedInputTokens,
          },
        },
      ]
    }
    case "error": {
      if (notif.params.willRetry) return []
      return [
        {
          type: "runner-finished",
          runnerId: runnerFor(notif.params.threadId, state),
          status: "errored",
          error: notif.params.error.message,
        },
      ]
    }
    case "item/agentMessage/delta": {
      const { threadId, itemId, delta } = notif.params
      return [
        {
          type: "text-delta",
          runnerId: runnerFor(threadId, state),
          messageId: messageIdFor(itemId, state),
          text: delta,
        },
      ]
    }
    case "item/reasoning/textDelta":
    case "item/reasoning/summaryTextDelta": {
      const { threadId, itemId, delta } = notif.params
      return [
        {
          type: "reasoning-delta",
          runnerId: runnerFor(threadId, state),
          messageId: messageIdFor(itemId, state),
          text: delta,
        },
      ]
    }
    case "item/commandExecution/outputDelta": {
      const { threadId, itemId, delta } = notif.params
      return [
        {
          type: "tool-output-delta",
          runnerId: runnerFor(threadId, state),
          callId: callIdFor(itemId, state),
          chunk: delta,
        },
      ]
    }
    case "item/started":
      return onItemStarted(
        notif.params.item,
        runnerFor(notif.params.threadId, state),
        state,
      )
    case "item/completed":
      return onItemCompleted(
        notif.params.item,
        runnerFor(notif.params.threadId, state),
        state,
      )
    default:
      return []
  }
}
