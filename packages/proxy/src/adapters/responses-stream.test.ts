import { describe, expect, it } from "bun:test"
import { collectStream, fromArray } from "../test-helpers"
import type { StreamEvent } from "../types"
import { serializeResponsesStream } from "./responses-stream"

describe("serializeResponsesStream", () => {
  it("emits response.created with the model and a terminal response.completed", async () => {
    const out = await collectStream(
      serializeResponsesStream(
        fromArray([{ type: "finish", finishReason: "stop" }]),
        "Ollama minimax m3",
      ),
    )
    expect(out).toContain("event: response.created")
    expect(out).toContain('"model":"Ollama minimax m3"')
    expect(out).toContain("event: response.completed")
  })

  it("streams text as output_text deltas inside a message item and includes the full text in the completed output", async () => {
    const events: StreamEvent[] = [
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "finish", finishReason: "stop" },
    ]
    const out = await collectStream(
      serializeResponsesStream(fromArray(events), "m"),
    )
    expect(out).toContain("event: response.output_item.added")
    expect(out).toContain("event: response.output_text.delta")
    expect(out).toContain('"delta":"Hel"')
    expect(out).toContain('"type":"output_text"')
    expect(out).toContain("event: response.output_item.done")
    // the completed output carries the assembled text
    expect(out).toContain('"text":"Hello"')
  })

  it("renders a tool-call as a function_call item with its call_id, name, and arguments", async () => {
    const events: StreamEvent[] = [
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "exec_command",
        input: { cmd: "echo hi" },
      },
      { type: "finish", finishReason: "tool-calls" },
    ]
    const out = await collectStream(
      serializeResponsesStream(fromArray(events), "m"),
    )
    expect(out).toContain('"type":"function_call"')
    expect(out).toContain('"call_id":"call_1"')
    expect(out).toContain('"name":"exec_command"')
    expect(out).toContain("event: response.function_call_arguments.delta")
    expect(out).toContain('"arguments":"{\\"cmd\\":\\"echo hi\\"}"')
  })

  it("includes every event's sequence_number and a stable response id across events", async () => {
    const out = await collectStream(
      serializeResponsesStream(
        fromArray([
          { type: "text-delta", text: "hi" },
          { type: "finish", finishReason: "stop" },
        ]),
        "m",
      ),
    )
    expect(out).toContain('"sequence_number":0')
    const ids = [...out.matchAll(/"id":"(resp_[^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(1) // one stable response id
  })
})
