import { describe, it, expect } from "bun:test"
import { parseAnthropicRequest } from "./anthropic-request"

describe("parseAnthropicRequest", () => {
  it("maps an Anthropic Messages body to a normalized request", () => {
    const body = { model: "default", max_tokens: 100, stream: true,
      system: "be terse", messages: [{ role: "user", content: "hi" }] }
    expect(parseAnthropicRequest(body)).toEqual({ ok: true, value: {
      model: "default", system: "be terse", maxTokens: 100, stream: true,
      messages: [{ role: "user", content: "hi" }],
    } })
  })
  it("flattens Anthropic content blocks into a single text string", () => {
    const body = { model: "default", max_tokens: 10, messages: [
      { role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }] }
    const r = parseAnthropicRequest(body)
    expect(r.ok && r.value.messages[0]?.content).toBe("ab")
  })
  it("returns bad-request when the body is missing messages", () => {
    expect(parseAnthropicRequest({ model: "x", max_tokens: 1 }).ok).toBe(false)
  })
})
