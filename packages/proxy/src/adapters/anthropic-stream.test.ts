import { describe, expect, it } from "bun:test"
import { collectStream, fromArray } from "../test-helpers"
import type { StreamEvent } from "../types"
import { serializeAnthropicStream } from "./anthropic-stream"

describe("serializeAnthropicStream", () => {
  it("emits message_start, content deltas, and message_stop for a text stream", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "finish", finishReason: "stop" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain("event: message_start")
    expect(out).toContain("content_block_delta")
    expect(out).toContain('"text":"Hel"')
    expect(out).toContain("event: message_stop")
  })

  it("renders a tool-call as a tool_use block with input_json_delta and a tool_use stop_reason", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "Let me check." },
      {
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "get_weather",
        input: { city: "Paris" },
      },
      { type: "finish", finishReason: "tool-calls" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain('"type":"tool_use"')
    expect(out).toContain('"id":"toolu_1"')
    expect(out).toContain('"name":"get_weather"')
    expect(out).toContain('"type":"input_json_delta"')
    expect(out).toContain('"partial_json":"{\\"city\\":\\"Paris\\"}"')
    // text is block 0; the tool_use block opens at index 1
    expect(out).toContain('"index":1')
    expect(out).toContain('"stop_reason":"tool_use"')
  })

  it("maps a plain stop finish reason to the Anthropic end_turn stop_reason", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "hi" },
      { type: "finish", finishReason: "stop" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain('"stop_reason":"end_turn"')
  })

  // RESILIENCE: the harness's Anthropic SDK cannot finalize a streamed message
  // without a terminal message_stop. A provider that drops the connection (or
  // any upstream that ends the stream WITHOUT a `finish` event) must still
  // yield a complete, parseable message — otherwise the harness reports
  // "API returned an empty or malformed response (HTTP 200)" and the turn dies.
  it("still emits content_block_stop, message_delta and message_stop when the stream ends without a finish event", async () => {
    const events: StreamEvent[] = [{ type: "text-delta", text: "partial" }]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain("event: content_block_stop")
    expect(out).toContain("event: message_delta")
    expect(out).toContain("event: message_stop")
  })

  // RESILIENCE: a mid-stream provider failure (timeout, 429, 5xx) arrives as a
  // terminal `error` event AFTER content has begun. It must be rendered as the
  // canonical Anthropic streaming error frame — `{"type":"error","error":{"type":...,"message":...}}`
  // — so the SDK recognises a real, typed (and retryable) error instead of choking
  // on a malformed stream. The previous frame omitted `error.type`.
  it("renders a mid-stream error as a well-formed Anthropic error event carrying error.type and message", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "thinking" },
      { type: "error", detail: "upstream boom", statusCode: 529 },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain("event: error")
    expect(out).toContain(
      '"error":{"type":"overloaded_error","message":"upstream boom"}',
    )
  })

  it("closes the open content block before emitting a stream error", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "thinking" },
      { type: "error", detail: "boom" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    const stopIdx = out.indexOf("event: content_block_stop")
    const errIdx = out.indexOf("event: error")
    expect(stopIdx).toBeGreaterThanOrEqual(0)
    expect(errIdx).toBeGreaterThan(stopIdx)
  })

  it("maps a rate-limit status to the Anthropic rate_limit_error type", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "x" },
      { type: "error", detail: "slow down", statusCode: 429 },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain('"type":"rate_limit_error"')
  })

  it("defaults an error with no upstream status to the Anthropic api_error type", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "x" },
      { type: "error", detail: "socket hang up" },
    ]
    const out = await collectStream(serializeAnthropicStream(fromArray(events)))
    expect(out).toContain('"type":"api_error"')
  })
})
