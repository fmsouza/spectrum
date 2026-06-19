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
 * Map a canonical QuestionAnswer → the updatedInput for the canUseTool allow result. The SDK passes
 * updatedInput back to the model as the tool's effective input; `answers` is keyed by question text.
 * Multi-select labels are comma-joined. Free text becomes a note annotation when a label is also
 * selected, or the answer itself when no label was chosen. Empty selections are omitted entirely. PURE.
 */
export const mapAnswerToUpdatedInput = (
  prompt: QuestionPrompt,
  originalInput: Record<string, unknown>,
  answer: QuestionAnswer,
): Record<string, unknown> => {
  const answers: Record<string, string> = {}
  const annotations: Record<string, { preview?: string; notes?: string }> = {}
  let hasAnnotations = false

  for (const sel of answer.selections) {
    const q = prompt.questions[sel.questionIndex]
    if (q === undefined) continue

    const free = sel.freeText?.trim() ?? ""
    const labels = sel.labels

    if (labels.length > 0) {
      answers[q.question] = labels.join(", ")
      // Preview: only when exactly one label is selected and the matched option has a preview.
      if (labels.length === 1) {
        const matchedOption = q.options.find((o) => o.label === labels[0])
        if (matchedOption?.preview !== undefined) {
          annotations[q.question] = {
            ...annotations[q.question],
            preview: matchedOption.preview,
          }
          hasAnnotations = true
        }
      }
      // Notes: free text is recorded as a note when a label is also present.
      if (free !== "") {
        annotations[q.question] = {
          ...annotations[q.question],
          notes: free,
        }
        hasAnnotations = true
      }
    } else if (free !== "") {
      // Free-text only: the answer is the free text; no annotations.
      answers[q.question] = free
    }
    // Nothing chosen: omit this question entirely.
  }

  return {
    ...originalInput,
    answers,
    ...(hasAnnotations ? { annotations } : {}),
  }
}
