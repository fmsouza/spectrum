import type { QuestionAnswer, QuestionPrompt } from "@spectrum/agent-events"
import { z } from "zod"

/** The AskUserQuestion tool input shape (SDK sdk-tools.d.ts), as carried by the dialog payload. */
const PayloadSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        header: z.string(),
        options: z.array(
          z.object({
            label: z.string(),
            description: z.string().optional(),
            preview: z.string().optional(),
          }),
        ),
        multiSelect: z.boolean().optional(),
      }),
    )
    .min(1),
})

/**
 * Map the opaque `ask_user_question` dialog payload → canonical QuestionPrompt. AskUserQuestion always
 * offers an "Other" free-text choice, so `allowFreeText` is always true. Returns undefined on a shape
 * mismatch so the caller can fail safe (cancel the dialog). PURE.
 */
export const mapAskUserQuestionPayload = (
  payload: Record<string, unknown>,
): QuestionPrompt | undefined => {
  const parsed = PayloadSchema.safeParse(payload)
  if (!parsed.success) return undefined
  return {
    questions: parsed.data.questions.map((q) => ({
      question: q.question,
      header: q.header,
      options: q.options.map((o) => ({
        label: o.label,
        ...(o.description !== undefined ? { description: o.description } : {}),
        ...(o.preview !== undefined ? { preview: o.preview } : {}),
      })),
      multiSelect: q.multiSelect ?? false,
      allowFreeText: true,
    })),
  }
}

/**
 * Map a canonical QuestionAnswer → the AskUserQuestionOutput shape the SDK returns to the model as the
 * tool result: `answers` keyed by question text (free text wins; multi-select labels are comma-joined). PURE.
 */
export const mapAnswerToAskUserQuestionResult = (
  prompt: QuestionPrompt,
  answer: QuestionAnswer,
): unknown => {
  const answers: Record<string, string> = {}
  for (const sel of answer.selections) {
    const q = prompt.questions[sel.questionIndex]
    if (q === undefined) continue
    const value =
      sel.freeText !== undefined && sel.freeText.length > 0
        ? sel.freeText
        : sel.labels.join(", ")
    answers[q.question] = value
  }
  return {
    questions: prompt.questions.map((q) => ({
      question: q.question,
      header: q.header,
      options: q.options,
      multiSelect: q.multiSelect,
    })),
    answers,
  }
}
