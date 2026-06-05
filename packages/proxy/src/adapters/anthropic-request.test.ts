import { describe, expect, it } from "bun:test"
import { parseAnthropicRequest } from "./anthropic-request"

describe("parseAnthropicRequest", () => {
  it("maps an Anthropic Messages body to a normalized request", () => {
    const body = {
      model: "default",
      max_tokens: 100,
      stream: true,
      system: "be terse",
      messages: [{ role: "user", content: "hi" }],
    }
    expect(parseAnthropicRequest(body)).toEqual({
      ok: true,
      value: {
        model: "default",
        system: "be terse",
        maxTokens: 100,
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      },
    })
  })
  it("flattens Anthropic content blocks into a single text string", () => {
    const body = {
      model: "default",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    }
    const r = parseAnthropicRequest(body)
    expect(r.ok && r.value.messages[0]?.content).toBe("ab")
  })
  it("returns bad-request when the body is missing messages", () => {
    expect(parseAnthropicRequest({ model: "x", max_tokens: 1 }).ok).toBe(false)
  })
  it("flattens a system array of text blocks into the system string", () => {
    const body = {
      model: "default",
      max_tokens: 10,
      system: [
        { type: "text", text: "A" },
        { type: "text", text: "B", cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: "hi" }],
    }
    const r = parseAnthropicRequest(body)
    expect(r.ok && r.value.system).toContain("A")
    expect(r.ok && r.value.system).toContain("B")
  })
  it("folds a system-role message into the system prompt and keeps only user/assistant in messages", () => {
    const body = {
      model: "default",
      max_tokens: 10,
      messages: [
        { role: "user", content: "hi" },
        { role: "system", content: "sys" },
      ],
    }
    const r = parseAnthropicRequest(body)
    expect(r.ok && r.value.messages).toEqual([{ role: "user", content: "hi" }])
    expect(r.ok && r.value.system).toContain("sys")
  })
  it("ignores non-text content blocks and extracts text", () => {
    const body = {
      model: "default",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "tool_result", tool_use_id: "t1", content: "ignored" },
          ],
        },
      ],
    }
    const r = parseAnthropicRequest(body)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.messages[0]?.content).toBe("hello")
  })
  it("ignores unknown top-level fields like tools and metadata", () => {
    const body = {
      model: "default",
      max_tokens: 10,
      tools: [{ name: "Bash", input_schema: { type: "object" } }],
      metadata: { user_id: "abc" },
      thinking: { type: "enabled", budget_tokens: 1024 },
      context_management: {},
      output_config: {},
      messages: [{ role: "user", content: "hi" }],
    }
    const r = parseAnthropicRequest(body)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.messages[0]?.content).toBe("hi")
  })
})
