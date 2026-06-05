import { describe, expect, it } from "bun:test"
import { parseOpenAIRequest } from "./openai-request"

describe("parseOpenAIRequest", () => {
  it("maps an OpenAI chat-completions body to a normalized request, lifting the system message", () => {
    const body = {
      model: "fast",
      stream: true,
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
    }
    expect(parseOpenAIRequest(body)).toEqual({
      ok: true,
      value: {
        model: "fast",
        system: "be terse",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      },
    })
  })
  it("returns bad-request when messages is not an array", () => {
    expect(parseOpenAIRequest({ model: "x", messages: "nope" }).ok).toBe(false)
  })
  it("extracts text from an array content of text blocks", () => {
    const body = {
      model: "fast",
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
    const r = parseOpenAIRequest(body)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.messages[0]?.content).toBe("ab")
  })
})
