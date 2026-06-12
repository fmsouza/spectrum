import { describe, expect, it } from "bun:test"
import { APICallError } from "ai"
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

  // Regression: a rate-limited provider must fail FAST with the provider's own
  // message — no AI SDK retry loop (the harness owns retry policy) and no
  // waiting out the 20s chunk timeout to surface the captured rejection.
  it(
    "yields the unwrapped provider error promptly when the provider rejects with a rate limit",
    async () => {
      const model = new MockLanguageModelV3({
        doStream: async () => {
          throw new APICallError({
            message: "Too Many Requests",
            url: "http://127.0.0.1:11434/api/chat",
            requestBodyValues: {},
            statusCode: 429,
            responseBody:
              '{"error":"you have reached your session usage limit"}',
            isRetryable: true,
          })
        },
      })
      const gw = createRealGateway()
      const req: NormalizedRequest = {
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }
      const events: StreamEvent[] = []
      for await (const e of gw.stream(model, req)) events.push(e)
      expect(events).toEqual([
        {
          type: "error",
          detail: "you have reached your session usage limit",
          statusCode: 429,
        },
      ])
    },
    // Generous for CI, but far below the AI SDK retry backoff (~6s) +
    // 20s chunk-timeout path this test exists to prevent.
    { timeout: 3000 },
  )
})
