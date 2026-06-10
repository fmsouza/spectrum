import { z } from "zod"

/**
 * The normalized OpenClaw Gateway event envelope (docs.openclaw.ai/gateway/protocol).
 * A discriminated union over the `event` string. Opaque/extra payload fields are tolerated
 * (`.passthrough()`) since the Gateway adds infra fields the adapter ignores; the discriminant
 * `event` + the fields the mapper reads are validated. seq/stateVersion are transport metadata.
 */
const base = { type: z.literal("event"), seq: z.number().int().optional() }

export const OpenClawEventSchema = z.discriminatedUnion("event", [
  z.object({
    ...base,
    event: z.literal("run.started"),
    payload: z
      .object({
        sessionKey: z.string(),
        runId: z.string().optional(),
        agentId: z.string().optional(),
        model: z.string().optional(),
        childSessionKey: z.string().optional(),
        parentSessionKey: z.string().optional(),
        spawnedByCallId: z.string().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("run.completed"),
    payload: z
      .object({ sessionKey: z.string(), runId: z.string().optional() })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("run.failed"),
    payload: z
      .object({
        sessionKey: z.string(),
        runId: z.string().optional(),
        error: z.string().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("assistant.delta"),
    payload: z
      .object({
        sessionKey: z.string(),
        messageId: z.string().optional(),
        deltaText: z.string().optional(),
        message: z.string().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("assistant.message"),
    payload: z
      .object({
        sessionKey: z.string(),
        messageId: z.string().optional(),
        message: z.string(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("tool.call.started"),
    payload: z
      .object({
        sessionKey: z.string(),
        callId: z.string(),
        tool: z.string(),
        input: z.unknown().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("tool.call.delta"),
    payload: z
      .object({ sessionKey: z.string(), callId: z.string(), chunk: z.string() })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("tool.call.completed"),
    payload: z
      .object({
        sessionKey: z.string(),
        callId: z.string(),
        status: z.enum(["ok", "error"]).optional(),
        output: z.string().optional(),
        exitCode: z.number().int().optional(),
        result: z.unknown().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("exec.approval.requested"),
    payload: z
      .object({
        sessionKey: z.string(),
        approvalId: z.string(),
        kind: z.enum(["command", "file", "tool"]).optional(),
        detail: z.string(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("exec.approval.resolved"),
    payload: z
      .object({
        sessionKey: z.string(),
        approvalId: z.string(),
        decision: z.string().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("usage"),
    payload: z
      .object({
        sessionKey: z.string(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        cachedInputTokens: z.number().int().nonnegative().optional(),
        costUsd: z.number().nonnegative().optional(),
      })
      .passthrough(),
  }),
  z.object({
    ...base,
    event: z.literal("error"),
    payload: z
      .object({ sessionKey: z.string().optional(), error: z.string() })
      .passthrough(),
  }),
])
export type OpenClawEvent = z.infer<typeof OpenClawEventSchema>

/** The connection target + auth for the Gateway (rendered from the fixed builtin def + AgentStartInput). */
export interface OpenclawConnectConfig {
  readonly url: string
  readonly token: string
  readonly agentId: string
  readonly model?: string
  readonly cwd: string
}

/** A live run over the Gateway: a normalized event stream + control. Mirrors the App SDK `run` handle. */
export interface OpenclawRun {
  /** Async iterator of normalized envelopes (App SDK `run.events()`). */
  events(): AsyncIterable<OpenClawEvent>
  /** Resolve an exec approval back to the Gateway (`exec.approval.resolve`). */
  resolveApproval(approvalId: string, decision: "allow" | "deny"): void
  /** Stop the current turn (App SDK `run.cancel()`). */
  cancel(): void
  /** Disconnect / end the run + WS (idempotent). */
  close(): void
}

/** A connected Gateway client: start runs + follow-up turns. Mirrors `new OpenClaw(...).agent`. */
export interface OpenclawTransport {
  /** Start an agent run for the initial prompt; returns the live run handle. */
  run(input: {
    readonly sessionKey: string
    readonly input: string
  }): OpenclawRun
  /** Send a follow-up user turn into the same session (App SDK `chat.send` on the session). */
  send(input: { readonly sessionKey: string; readonly text: string }): void
  /** Tear down the underlying WebSocket connection (idempotent). */
  disconnect(): void
}

/**
 * Connect to the Gateway and complete the handshake (App SDK `new OpenClaw({url,token}); await connect()`).
 * Injected so the adapter is testable with a fake; the real impl (built on `@openclaw/sdk` once published,
 * or the raw Gateway WS protocol, or `openclaw acp` stdio) is UNVERIFIED — no binary in this environment.
 */
export type OpenclawConnect = (
  config: OpenclawConnectConfig,
) => Promise<OpenclawTransport>
