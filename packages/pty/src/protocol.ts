import { type SessionId, SessionIdSchema } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"

export type PtyOutbound =
  | { readonly type: "pty-data"; readonly id: SessionId; readonly data: string }
  | { readonly type: "pty-exit"; readonly id: SessionId; readonly code: number }

export type PtyInbound =
  | {
      readonly type: "pty-input"
      readonly id: SessionId
      readonly data: string
    }
  | {
      readonly type: "pty-resize"
      readonly id: SessionId
      readonly cols: number
      readonly rows: number
    }
  | { readonly type: "pty-attach"; readonly id: SessionId }
  | { readonly type: "pty-kill"; readonly id: SessionId }

export const bytesToBase64 = (b: Uint8Array): string => {
  let s = ""
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s)
}

export const base64ToBytes = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const encodeData = (id: SessionId, bytes: Uint8Array): PtyOutbound => ({
  type: "pty-data",
  id,
  data: bytesToBase64(bytes),
})

export const encodeExit = (id: SessionId, code: number): PtyOutbound => ({
  type: "pty-exit",
  id,
  code,
})

const InboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pty-input"),
    id: SessionIdSchema,
    data: z.string(),
  }),
  z.object({
    type: z.literal("pty-resize"),
    id: SessionIdSchema,
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  z.object({ type: z.literal("pty-attach"), id: SessionIdSchema }),
  z.object({ type: z.literal("pty-kill"), id: SessionIdSchema }),
])

export const decodeInbound = (
  raw: unknown,
): Result<PtyInbound, { kind: "bad-message" }> => {
  const parsed = InboundSchema.safeParse(raw)
  return parsed.success ? ok(parsed.data) : err({ kind: "bad-message" })
}
