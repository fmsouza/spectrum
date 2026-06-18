import { describe, expect, it } from "bun:test"
import {
  mapAnswerToAskUserQuestionResult,
  mapAskUserQuestionPayload,
} from "./ask-user-question"

const payload = {
  questions: [
    {
      question: "Which library?",
      header: "Library",
      options: [{ label: "date-fns", description: "lightweight" }],
      multiSelect: false,
    },
  ],
}

describe("mapAskUserQuestionPayload", () => {
  it("maps the SDK payload to a QuestionPrompt with free text allowed", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    expect(prompt?.questions[0]?.header).toBe("Library")
    expect(prompt?.questions[0]?.allowFreeText).toBe(true)
    expect(prompt?.questions[0]?.options[0]?.label).toBe("date-fns")
  })
  it("returns undefined for a malformed payload", () => {
    expect(mapAskUserQuestionPayload({ nope: 1 })).toBeUndefined()
  })
})

describe("mapAnswerToAskUserQuestionResult", () => {
  it("keys answers by question text", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToAskUserQuestionResult(prompt, {
      selections: [{ questionIndex: 0, labels: ["date-fns"] }],
    }) as { answers: Record<string, string> }
    expect(result.answers["Which library?"]).toBe("date-fns")
  })
  it("uses free text when provided", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToAskUserQuestionResult(prompt, {
      selections: [{ questionIndex: 0, labels: [], freeText: "luxon" }],
    }) as { answers: Record<string, string> }
    expect(result.answers["Which library?"]).toBe("luxon")
  })
})
