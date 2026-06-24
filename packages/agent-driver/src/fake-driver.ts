import type { CanonicalEvent, RunnerId } from "@spectrum/agent-events"
import type { SessionId } from "@spectrum/types"
import { ok } from "@spectrum/utils"
import type { AgentDriver, AgentSession, AgentStartInput } from "./driver"

export type FakeReaction =
  | { on: "start"; emit: readonly CanonicalEvent[] }
  | { on: "send"; emit: readonly CanonicalEvent[] }
  | { on: "approve"; emit: readonly CanonicalEvent[] }
  | { on: "answer"; emit: readonly CanonicalEvent[] }
  | { on: "interrupt"; emit: readonly CanonicalEvent[] }

export type FakeScript = {
  readonly rootRunnerId: RunnerId
  readonly reactions: readonly FakeReaction[]
  /** When set, the fake reports this token via setResumeId on start (simulating the driver learning its native id). */
  readonly resumeToken?: string
}

/**
 * A scripted driver: emits the `on:"start"` batch once `onEvent` is registered, then dequeues one
 * batch of the matching kind per command. `scheduler` defaults to `queueMicrotask`; tests pass a
 * synchronous `(fn) => fn()` for determinism.
 */
export const createFakeDriver = (deps: {
  script: FakeScript
  scheduler?: (fn: () => void) => void
  /** Invoked with each AgentStartInput so a test can assert resume/sessionId were forwarded. Optional. */
  onStart?: (input: AgentStartInput) => void
  /** Persisted-token sink the fake calls when script.resumeToken is set. Optional. */
  setResumeId?: (sessionId: SessionId, resumeId: string) => void
}): AgentDriver => {
  const schedule =
    deps.scheduler ?? ((fn: () => void): void => queueMicrotask(fn))

  const start: AgentDriver["start"] = (input) => {
    deps.onStart?.(input)
    if (
      deps.script.resumeToken !== undefined &&
      input.sessionId !== undefined &&
      deps.setResumeId !== undefined
    ) {
      deps.setResumeId(input.sessionId, deps.script.resumeToken)
    }
    let cb: ((e: CanonicalEvent) => void) | null = null
    // Per-kind FIFO queues of batches, drained one batch per command.
    const queues = {
      send: deps.script.reactions
        .filter((r) => r.on === "send")
        .map((r) => r.emit),
      approve: deps.script.reactions
        .filter((r) => r.on === "approve")
        .map((r) => r.emit),
      answer: deps.script.reactions
        .filter((r) => r.on === "answer")
        .map((r) => r.emit),
      interrupt: deps.script.reactions
        .filter((r) => r.on === "interrupt")
        .map((r) => r.emit),
    }
    const startBatch =
      deps.script.reactions.find((r) => r.on === "start")?.emit ?? []

    const emit = (events: readonly CanonicalEvent[]): void => {
      schedule(() => {
        for (const e of events) cb?.(e)
      })
    }
    const dequeue = (
      kind: "send" | "approve" | "answer" | "interrupt",
    ): void => {
      const next = queues[kind].shift()
      if (next !== undefined) emit(next)
    }

    const session: AgentSession = {
      rootRunnerId: deps.script.rootRunnerId,
      onEvent: (next) => {
        cb = next
        emit(startBatch)
      },
      send: () => {
        dequeue("send")
        return ok(undefined)
      },
      respondApproval: () => {
        dequeue("approve")
        return ok(undefined)
      },
      respondQuestion: () => {
        dequeue("answer")
        return ok(undefined)
      },
      interrupt: () => {
        dequeue("interrupt")
        return ok(undefined)
      },
      close: () => ok(undefined),
    }
    return ok(session)
  }

  return { start }
}

const ROOT = "r_demo_root" as RunnerId
const SUB = "r_demo_sub" as RunnerId

/**
 * A ready-made demo run for the dev "demo" harness + Plan 3's UI: root runner → assistant text →
 * a tool call → a sub-runner spawned by that tool call → an approval request. Each command then
 * advances the run (send → more text; approve → the approval resolves + both runners finish).
 */
export const demoScript: FakeScript = {
  rootRunnerId: ROOT,
  reactions: [
    {
      on: "start",
      emit: [
        {
          type: "runner-started",
          runnerId: ROOT,
          title: "Demo run",
          model: "demo-model",
        },
        {
          type: "text-delta",
          runnerId: ROOT,
          messageId: "m_intro",
          text: "Working on it…",
        },
        {
          type: "tool-call-started",
          runnerId: ROOT,
          callId: "call_sub",
          tool: "Task",
          input: { prompt: "investigate" },
        },
        {
          type: "runner-started",
          runnerId: SUB,
          parentRunnerId: ROOT,
          spawnedByCallId: "call_sub",
          agentType: "Task",
          title: "Investigator",
        },
        {
          type: "text-delta",
          runnerId: SUB,
          messageId: "m_sub",
          text: "Looking into it.",
        },
        {
          type: "approval-requested",
          runnerId: ROOT,
          requestId: "req_demo",
          target: { kind: "command", detail: "rm -rf build" },
        },
      ],
    },
    {
      on: "send",
      emit: [
        {
          type: "text-delta",
          runnerId: ROOT,
          messageId: "m_intro",
          text: " continuing.",
        },
      ],
    },
    {
      on: "approve",
      emit: [
        {
          type: "approval-resolved",
          runnerId: ROOT,
          requestId: "req_demo",
          decision: "allow",
          by: "user",
        },
        {
          type: "tool-call-finished",
          runnerId: ROOT,
          callId: "call_sub",
          status: "ok",
          output: "done",
        },
        { type: "runner-finished", runnerId: SUB, status: "completed" },
        { type: "runner-finished", runnerId: ROOT, status: "completed" },
      ],
    },
    {
      on: "interrupt",
      emit: [
        { type: "runner-finished", runnerId: ROOT, status: "interrupted" },
      ],
    },
  ],
}
