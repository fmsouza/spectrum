import { describe, expect, it } from "bun:test"
import type { NormalizedRequest } from "../types"
import { mapFullStreamPart, toModelMessages } from "./real-gateway"

describe("mapFullStreamPart", () => {
  it("maps a high-level text-delta part (carrying `text`) to a text-delta event", () => {
    expect(mapFullStreamPart({ type: "text-delta", text: "hi" })).toEqual({
      type: "text-delta",
      text: "hi",
    })
  })

  it("maps a tool-call part to a tool-call event carrying the assembled input", () => {
    expect(
      mapFullStreamPart({
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "get_weather",
        input: { city: "Berlin" },
      }),
    ).toEqual({
      type: "tool-call",
      toolCallId: "call_1",
      toolName: "get_weather",
      input: { city: "Berlin" },
    })
  })

  it("maps a finish part to a finish event with stringified reason", () => {
    expect(mapFullStreamPart({ type: "finish", finishReason: "stop" })).toEqual(
      { type: "finish", finishReason: "stop" },
    )
  })

  it("maps a finish part with totalUsage to a finish event carrying usage tokens", () => {
    expect(
      mapFullStreamPart({
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
      }),
    ).toEqual({
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 7, outputTokens: 11 },
    })
  })

  it("maps an error part to an error event", () => {
    expect(
      mapFullStreamPart({ type: "error", error: new Error("boom") }),
    ).toEqual({ type: "error", detail: "Error: boom" })
  })

  it("returns undefined for unknown part types", () => {
    expect(mapFullStreamPart({ type: "text-start" })).toBeUndefined()
  })

  it("returns undefined for tool-input-delta parts (streamed, not assembled)", () => {
    expect(
      mapFullStreamPart({ type: "tool-input-delta", delta: "{" }),
    ).toBeUndefined()
  })

  it("returns undefined for reasoning-delta parts", () => {
    expect(
      mapFullStreamPart({ type: "reasoning-delta", text: "thinking" }),
    ).toBeUndefined()
  })

  it("returns undefined for start parts", () => {
    expect(mapFullStreamPart({ type: "start" })).toBeUndefined()
  })
})

describe("toModelMessages", () => {
  it("passes a string-content user message through unchanged", () => {
    const req: NormalizedRequest = {
      model: "m",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    }
    expect(toModelMessages(req)).toEqual([{ role: "user", content: "hello" }])
  })

  it("maps an assistant message with [text, tool-call] parts to AI SDK parts", () => {
    const req: NormalizedRequest = {
      model: "m",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check." },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "Berlin" },
            },
          ],
        },
      ],
      stream: true,
    }
    expect(toModelMessages(req)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "Berlin" },
          },
        ],
      },
    ])
  })

  it("maps a tool-role message with a tool-result part to the AI SDK text-output shape", () => {
    const req: NormalizedRequest = {
      model: "m",
      messages: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "get_weather",
              output: "sunny",
            },
          ],
        },
      ],
      stream: true,
    }
    expect(toModelMessages(req)).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: { type: "text", value: "sunny" },
          },
        ],
      },
    ])
  })
})
