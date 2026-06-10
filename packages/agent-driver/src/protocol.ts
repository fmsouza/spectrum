import { ApprovalDecisionSchema } from "@launchkit/agent-events"
import type { ApprovalDecision, StoredEvent } from "@launchkit/agent-events"
import { type SessionId, SessionIdSchema } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"

export type RunnerOutbound = {
  readonly type: "runner-event"
  readonly id: SessionId
  readonly event: StoredEvent
}

export type RunnerInbound =
  | { readonly type: "run-attach"; readonly id: SessionId }
  | { readonly type: "run-send"; readonly id: SessionId; readonly text: string }
  | {
      readonly type: "run-approve"
      readonly id: SessionId
      readonly requestId: string
      readonly decision: ApprovalDecision
    }
  | { readonly type: "run-interrupt"; readonly id: SessionId }

const InboundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run-attach"), id: SessionIdSchema }),
  z.object({
    type: z.literal("run-send"),
    id: SessionIdSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal("run-approve"),
    id: SessionIdSchema,
    requestId: z.string(),
    decision: ApprovalDecisionSchema,
  }),
  z.object({ type: z.literal("run-interrupt"), id: SessionIdSchema }),
])

export const decodeRunnerInbound = (
  raw: unknown,
): Result<RunnerInbound, { kind: "bad-message" }> => {
  const parsed = InboundSchema.safeParse(raw)
  return parsed.success ? ok(parsed.data) : err({ kind: "bad-message" })
}
