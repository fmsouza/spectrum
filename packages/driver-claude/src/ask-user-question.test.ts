import { describe, expect, it } from "bun:test"
import {
  mapAnswerToUpdatedInput,
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

describe("mapAnswerToUpdatedInput", () => {
  it("keys answers by question text and preserves the original input", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const originalInput = { ...payload, extra: "preserved" }
    const result = mapAnswerToUpdatedInput(prompt, originalInput, {
      selections: [{ questionIndex: 0, labels: ["date-fns"] }],
    }) as { answers: Record<string, string>; extra: string }
    expect(result.answers["Which library?"]).toBe("date-fns")
    expect(result.extra).toBe("preserved")
  })

  it("joins multi-select labels with a comma", () => {
    const multiPayload = {
      questions: [
        {
          question: "Which tools?",
          header: "Tools",
          options: [
            { label: "a", description: "A" },
            { label: "b", description: "B" },
          ],
          multiSelect: true,
        },
      ],
    }
    const prompt = mapAskUserQuestionPayload(multiPayload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToUpdatedInput(prompt, multiPayload, {
      selections: [{ questionIndex: 0, labels: ["a", "b"] }],
    }) as { answers: Record<string, string> }
    expect(result.answers["Which tools?"]).toBe("a, b")
  })

  it("uses free text as the answer when no label is selected", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToUpdatedInput(prompt, payload, {
      selections: [{ questionIndex: 0, labels: [], freeText: "luxon" }],
    }) as {
      answers: Record<string, string>
      annotations?: Record<string, unknown>
    }
    expect(result.answers["Which library?"]).toBe("luxon")
    expect(result.annotations).toBeUndefined()
  })

  it("records free text as a note when a label is also selected", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToUpdatedInput(prompt, payload, {
      selections: [
        {
          questionIndex: 0,
          labels: ["date-fns"],
          freeText: "but check bundle size",
        },
      ],
    }) as {
      answers: Record<string, string>
      annotations: Record<string, { notes?: string }>
    }
    expect(result.answers["Which library?"]).toBe("date-fns")
    expect(result.annotations?.["Which library?"]?.notes).toBe(
      "but check bundle size",
    )
  })

  it("records the selected option's preview as an annotation", () => {
    const previewPayload = {
      questions: [
        {
          question: "Which library?",
          header: "Library",
          options: [
            {
              label: "date-fns",
              description: "lightweight",
              preview: "PREVIEW",
            },
          ],
          multiSelect: false,
        },
      ],
    }
    const prompt = mapAskUserQuestionPayload(previewPayload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToUpdatedInput(prompt, previewPayload, {
      selections: [{ questionIndex: 0, labels: ["date-fns"] }],
    }) as {
      answers: Record<string, string>
      annotations: Record<string, { preview?: string }>
    }
    expect(result.annotations?.["Which library?"]?.preview).toBe("PREVIEW")
  })

  it("omits a question with an empty selection", () => {
    const prompt = mapAskUserQuestionPayload(payload)
    if (prompt === undefined) throw new Error("expected prompt")
    const result = mapAnswerToUpdatedInput(prompt, payload, {
      selections: [{ questionIndex: 0, labels: [], freeText: "" }],
    }) as { answers: Record<string, string> }
    expect(Object.keys(result.answers)).toHaveLength(0)
  })
})
