import { RunnerIdSchema, SessionIdSchema } from "@launchkit/types"
import { z } from "zod"

export type Json = unknown

export const UsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  })
  .strict()
export type Usage = z.infer<typeof UsageSchema>

export const ApprovalTargetSchema = z
  .object({
    kind: z.enum(["command", "file", "tool"]),
    detail: z.string(),
  })
  .strict()
export type ApprovalTarget = z.infer<typeof ApprovalTargetSchema>

export const ApprovalDecisionSchema = z.enum(["allow", "deny", "allow-always"])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

export const CanonicalEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("runner-started"),
      runnerId: RunnerIdSchema,
      parentRunnerId: RunnerIdSchema.optional(),
      spawnedByCallId: z.string().optional(),
      agentType: z.string().optional(),
      title: z.string().optional(),
      model: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("runner-finished"),
      runnerId: RunnerIdSchema,
      status: z.enum(["completed", "errored", "interrupted"]),
      error: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("turn-finished"),
      runnerId: RunnerIdSchema,
      usage: UsageSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("text-delta"),
      runnerId: RunnerIdSchema,
      messageId: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reasoning-delta"),
      runnerId: RunnerIdSchema,
      messageId: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-call-started"),
      runnerId: RunnerIdSchema,
      callId: z.string(),
      tool: z.string(),
      input: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-output-delta"),
      runnerId: RunnerIdSchema,
      callId: z.string(),
      chunk: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-call-finished"),
      runnerId: RunnerIdSchema,
      callId: z.string(),
      status: z.enum(["ok", "error"]),
      output: z.string().optional(),
      exitCode: z.number().int().optional(),
      result: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("file-change"),
      runnerId: RunnerIdSchema,
      callId: z.string().optional(),
      path: z.string(),
      kind: z.enum(["add", "update", "delete"]),
      diff: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("approval-requested"),
      runnerId: RunnerIdSchema,
      requestId: z.string(),
      target: ApprovalTargetSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("approval-resolved"),
      runnerId: RunnerIdSchema,
      requestId: z.string(),
      decision: ApprovalDecisionSchema,
      by: z.enum(["user", "policy"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("usage"),
      runnerId: RunnerIdSchema,
      usage: UsageSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("annotation"),
      runnerId: RunnerIdSchema,
      kind: z.string(),
      data: z.unknown(),
    })
    .strict(),
])
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>

export const StoredEventSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    sessionId: SessionIdSchema,
    ts: z.string().datetime(),
    event: CanonicalEventSchema,
  })
  .strict()
export type StoredEvent = z.infer<typeof StoredEventSchema>
