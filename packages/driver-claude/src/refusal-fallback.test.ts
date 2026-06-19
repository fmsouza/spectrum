import { describe, expect, it } from "bun:test"
import type { QuestionAnswer } from "@spectrum/agent-events"
import {
  mapAnswerToRefusalChoice,
  mapRefusalFallbackPayload,
} from "./refusal-fallback"

describe("mapRefusalFallbackPayload", () => {
  it("builds a single two-option question naming both models", () => {
    const prompt = mapRefusalFallbackPayload({
      originalModel: "opus",
      fallbackModel: "sonnet",
    })
    expect(prompt).toBeDefined()
    if (prompt === undefined) throw new Error("expected prompt")
    expect(prompt.questions).toHaveLength(1)
    const q = prompt.questions[0]
    if (q === undefined) throw new Error("expected question")
    expect(q.options).toHaveLength(2)
    expect(q.multiSelect).toBe(false)
    expect(q.allowFreeText).toBe(false)
    expect(q.question).toContain("opus")
    expect(q.question).toContain("sonnet")
  })

  it("includes the refusal category in the question when present", () => {
    const prompt = mapRefusalFallbackPayload({
      originalModel: "opus",
      fallbackModel: "sonnet",
      apiRefusalCategory: "cyber",
    })
    expect(prompt).toBeDefined()
    if (prompt === undefined) throw new Error("expected prompt")
    const q = prompt.questions[0]
    if (q === undefined) throw new Error("expected question")
    expect(q.question).toContain("cyber")
  })

  it("returns undefined for a malformed payload", () => {
    expect(mapRefusalFallbackPayload({ nope: 1 })).toBeUndefined()
  })
})

describe("mapAnswerToRefusalChoice", () => {
  // Build a real prompt to get the canonical labels
  const prompt = mapRefusalFallbackPayload({
    originalModel: "opus",
    fallbackModel: "sonnet",
  })
  if (prompt === undefined) throw new Error("expected prompt in test setup")
  const retryLabel = prompt.questions[0]?.options[0]?.label
  const editLabel = prompt.questions[0]?.options[1]?.label
  if (retryLabel === undefined || editLabel === undefined)
    throw new Error("expected option labels in test setup")

  it("maps the retry option to retry_fallback", () => {
    const answer: QuestionAnswer = {
      selections: [{ questionIndex: 0, labels: [retryLabel] }],
    }
    expect(mapAnswerToRefusalChoice(answer)).toBe("retry_fallback")
  })

  it("maps the edit option to edit_prompt", () => {
    const answer: QuestionAnswer = {
      selections: [{ questionIndex: 0, labels: [editLabel] }],
    }
    expect(mapAnswerToRefusalChoice(answer)).toBe("edit_prompt")
  })

  it("maps an empty/unknown selection to cancelled", () => {
    const emptyAnswer: QuestionAnswer = {
      selections: [{ questionIndex: 0, labels: [] }],
    }
    expect(mapAnswerToRefusalChoice(emptyAnswer)).toBe("cancelled")

    const unknownAnswer: QuestionAnswer = {
      selections: [{ questionIndex: 0, labels: ["something else"] }],
    }
    expect(mapAnswerToRefusalChoice(unknownAnswer)).toBe("cancelled")

    const noSelections: QuestionAnswer = { selections: [] }
    expect(mapAnswerToRefusalChoice(noSelections)).toBe("cancelled")
  })
})
