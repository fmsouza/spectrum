import { describe, expect, it } from "bun:test"
import { MockLanguageModelV1, simulateReadableStream } from "ai/test"
import type { NormalizedRequest } from "../types"
import { createRealGateway } from "./real-gateway"

describe("createRealGateway", () => {
  it("maps streamText text deltas to normalized text-delta and finish events", async () => {
    const model = new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-delta" as const, textDelta: "Hello" },
            { type: "text-delta" as const, textDelta: " world" },
            {
              type: "finish" as const,
              finishReason: "stop" as const,
              usage: { promptTokens: 1, completionTokens: 2 },
            },
          ],
        }),
        rawCall: { rawPrompt: "hi", rawSettings: {} },
      }),
    })
    const gw = createRealGateway()
    const req: NormalizedRequest = {
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    }
    const events: import("../types").StreamEvent[] = []
    for await (const e of gw.stream(model, req)) events.push(e)
    expect(events[0]).toEqual({ type: "text-delta", text: "Hello" })
    expect(events[1]).toEqual({ type: "text-delta", text: " world" })
    expect(events[2]).toMatchObject({ type: "finish", finishReason: "stop" })
  })
})
