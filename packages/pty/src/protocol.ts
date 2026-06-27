import { SessionIdSchema } from "@spectrum/types"
import { type Err, type Ok, type Result, isErr } from "@spectrum/utils"
import { z } from "zod"

/** Per-tab identifier; generated client-side. */
export const TabIdSchema = z.string().uuid().brand<"TabId">()
export type TabId = z.infer<typeof TabIdSchema>

/** base64 (text-safe) encoding of arbitrary PTY bytes. */
const Base64Schema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/)

export const TerminalInboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("term-open"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    cwd: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    env: z.record(z.string(), z.string()).optional(),
  }).strict(),
  z.object({
    type: z.literal("term-attach"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
  }).strict(),
  z.object({
    type: z.literal("term-input"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    data: Base64Schema,
  }).strict(),
  z.object({
    type: z.literal("term-resize"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }).strict(),
  z.object({
    type: z.literal("term-close"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
  }).strict(),
])

export type TerminalInbound = z.infer<typeof TerminalInboundSchema>

export const TerminalOutboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("term-opened"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
  }).strict(),
  z.object({
    type: z.literal("term-output"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    data: Base64Schema,
  }).strict(),
  z.object({
    type: z.literal("term-exited"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    exitCode: z.number().int(),
  }).strict(),
  z.object({
    type: z.literal("term-error"),
    sessionId: SessionIdSchema,
    tabId: TabIdSchema,
    message: z.string().min(1),
  }).strict(),
])

export type TerminalOutbound = z.infer<typeof TerminalOutboundSchema>

/** zod-validated inbound decode — returns a Result, never throws. */
export const decodeTerminalInbound = (raw: unknown): Result<TerminalInbound, z.ZodError> => {
  const parsed = TerminalInboundSchema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data } as Ok<TerminalInbound>
  return { ok: false, error: parsed.error } as Err<z.ZodError>
}

/** Re-exported for the socket's outbound-validation path (test helper). */
export const isTerminalOutbound = (raw: unknown): raw is TerminalOutbound =>
  TerminalOutboundSchema.safeParse(raw).success

// keep isErr referenced so tree-shaking doesn't warn in strict builds
export const _protocolInternal = { isErr } as const
