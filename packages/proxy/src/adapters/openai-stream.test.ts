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
})
