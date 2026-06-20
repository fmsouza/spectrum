import { describe, expect, it } from "bun:test"
import { collectStream, fromArray } from "../test-helpers"
import type { StreamEvent } from "../types"
import { serializeOpenAIStream } from "./openai-stream"

describe("serializeOpenAIStream", () => {
  it("emits chat.completion.chunk data lines and a terminal [DONE]", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "Hi" },
      { type: "finish", finishReason: "stop" },
    ]
    const out = await collectStream(
      serializeOpenAIStream(fromArray(events), "fast"),
    )
    expect(out).toContain('"object":"chat.completion.chunk"')
    expect(out).toContain('"content":"Hi"')
    expect(out).toContain("data: [DONE]")
  })

  it("renders a tool-call as an OpenAI tool_calls delta and finishes with tool_calls", async () => {
    const events: StreamEvent[] = [
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "get_weather",
        input: { city: "Paris" },
      },
      { type: "finish", finishReason: "tool-calls" },
    ]
    const out = await collectStream(
      serializeOpenAIStream(fromArray(events), "fast"),
    )
    expect(out).toContain('"tool_calls"')
    expect(out).toContain('"id":"call_1"')
    expect(out).toContain('"name":"get_weather"')
    expect(out).toContain('"arguments":"{\\"city\\":\\"Paris\\"}"')
    expect(out).toContain('"finish_reason":"tool_calls"')
    expect(out).toContain("data: [DONE]")
  })

  it("emits an OpenAI error object (not a fake success) on a provider error", async () => {
    async function* events() {
      yield { type: "text-delta", text: "partial" } as const
      yield {
        type: "error",
        detail: "LLM provider stalled",
        statusCode: 529,
      } as const
    }
    const stream = serializeOpenAIStream(events(), "m")
    const text = await new Response(stream).text()
    expect(text).toContain('"error"')
    expect(text).toContain("LLM provider stalled")
    expect(text).not.toContain("[error:")
    expect(text).not.toContain('"finish_reason":"stop"')
  })
})
