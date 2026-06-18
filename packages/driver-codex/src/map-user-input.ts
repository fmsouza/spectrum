import type { QuestionAnswer, QuestionPrompt } from "@spectrum/agent-events"
import type { ToolRequestUserInputParams } from "./bindings/v2/ToolRequestUserInputParams"

/** Map codex `item/tool/requestUserInput` params → canonical QuestionPrompt. PURE. */
export const mapUserInputParams = (
  params: ToolRequestUserInputParams,
): QuestionPrompt => ({
  questions: params.questions.map((q) => ({
    question: q.question,
    header: q.header,
    options: (q.options ?? []).map((o) => ({
      label: o.label,
      description: o.description,
    })),
    multiSelect: false,
    allowFreeText: q.isOther,
  })),
})

/** Map a canonical answer → the codex requestUserInput response (answers keyed by question id). PURE. */
export const mapAnswerToUserInputResponse = (
  params: ToolRequestUserInputParams,
  answer: QuestionAnswer,
): { answers: Record<string, { answers: string[] }> } => {
  const out: Record<string, { answers: string[] }> = {}
  for (const sel of answer.selections) {
    const q = params.questions[sel.questionIndex]
    if (q === undefined) continue
    const values =
      sel.freeText !== undefined && sel.freeText.length > 0
        ? [sel.freeText]
        : sel.labels
    out[q.id] = { answers: values }
  }
  return { answers: out }
}
