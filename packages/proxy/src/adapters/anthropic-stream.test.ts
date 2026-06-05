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
})
