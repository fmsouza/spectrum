/**
 * The minimal structural subset of `@anthropic-ai/claude-agent-sdk`'s `SDKMessage` union that the
 * PURE mapper reads. Kept here (not imported from the SDK) so `mapClaudeMessage` + its tests run
 * without the SDK package or the `claude` binary. The live glue (`sdk-glue.ts`) casts real
 * `SDKMessage`s to these — they are a structural subset, so the cast is sound.
 */
export interface SdkTextBlock {
  readonly type: "text"
  readonly text: string
}
export interface SdkToolUseBlock {
  readonly type: "tool_use"
  readonly id: string
  readonly name: string
  readonly input?: unknown
}
export interface SdkToolResultBlock {
  readonly type: "tool_result"
  readonly tool_use_id: string
  readonly content?: unknown
  readonly is_error?: boolean
}
export type SdkContentBlock =
  | SdkTextBlock
  | SdkToolUseBlock
  | SdkToolResultBlock
  | { readonly type: string }

export interface SdkSystemInit {
  readonly type: "system"
  readonly subtype: "init"
  readonly model: string
  readonly session_id?: string
}
export interface SdkAssistantMessage {
  readonly type: "assistant"
  readonly message: { readonly content: readonly SdkContentBlock[] }
  readonly parent_tool_use_id: string | null
}
export interface SdkUserMessage {
  readonly type: "user"
  readonly message: { readonly content: string | readonly SdkContentBlock[] }
  readonly parent_tool_use_id: string | null
}
export interface SdkStreamEvent {
  readonly type: "stream_event"
  readonly event: unknown
  readonly parent_tool_use_id: string | null
}
export interface SdkResultUsage {
  readonly input_tokens?: number
  readonly output_tokens?: number
  readonly cache_read_input_tokens?: number
}
export interface SdkResultMessage {
  readonly type: "result"
  readonly subtype: string
  readonly is_error: boolean
  /** The turn's final text — present on success results and some error subtypes. */
  readonly result?: string
  readonly total_cost_usd?: number
  readonly usage?: SdkResultUsage
}
export type SdkMessageLike =
  | SdkSystemInit
  | SdkAssistantMessage
  | SdkUserMessage
  | SdkStreamEvent
  | SdkResultMessage
  | { readonly type: string }
