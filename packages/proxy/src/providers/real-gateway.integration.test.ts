import { describe, expect, it } from "bun:test"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import type { NormalizedRequest, StreamEvent } from "../types"
import { createRealGateway } from "./real-gateway"

describe("createRealGateway", () => {
  it("maps streamText text deltas to normalized text-delta and finish events", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start" as const, id: "0" },
            { type: "text-delta" as const, id: "0", delta: "Hello" },
            { type: "text-delta" as const, id: "0", delta: " world" },
            { type: "text-end" as const, id: "0" },
            {
              type: "finish" as const,
              // v6 provider-level finish: finishReason is a { unified, raw } object and
              // input/output usage are breakdown objects (LanguageModelV3Usage).
              finishReason: { unified: "stop" as const, raw: "stop" },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 2, text: 2, reasoning: 0 },
              },
            },
          ],
        }),
      }),
    })
    const gw = createRealGateway()
    const req: NormalizedRequest = {
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    }
    const events: StreamEvent[] = []
    for await (const e of gw.stream(model, req)) events.push(e)
    expect(events[0]).toEqual({ type: "text-delta", text: "Hello" })
    expect(events[1]).toEqual({ type: "text-delta", text: " world" })
    expect(events[2]).toMatchObject({ type: "finish", finishReason: "stop" })
  })
})
