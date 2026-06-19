import type { QuestionAnswer, QuestionPrompt } from "@spectrum/agent-events"
import { z } from "zod"

/**
 * The choice the host returns to the SDK for the refusal_fallback_prompt dialog.
 * Maps directly to the SDK's result enum.
 */
export type RefusalChoice = "retry_fallback" | "edit_prompt" | "cancelled"

/** Shared label constants — used in both mappers so they stay coupled. PURE. */
const RETRY_LABEL = "Retry on the fallback model"
const EDIT_LABEL = "Keep this model and edit my prompt"

/** Zod schema for the refusal_fallback_prompt dialog payload. */
const PayloadSchema = z.object({
  originalModel: z.string(),
  fallbackModel: z.string(),
  apiRefusalCategory: z.string().nullish(),
  guidanceText: z.string().optional(),
  retractedMessageUuids: z.array(z.string()).optional(),
})

/**
 * Map the opaque `refusal_fallback_prompt` dialog payload → canonical QuestionPrompt.
 * Returns undefined on a shape mismatch so the caller can fail safe (cancel the dialog). PURE.
 */
export const mapRefusalFallbackPayload = (
  payload: Record<string, unknown>,
): QuestionPrompt | undefined => {
  const parsed = PayloadSchema.safeParse(payload)
  if (!parsed.success) return undefined

  const { originalModel, fallbackModel, apiRefusalCategory } = parsed.data

  const categoryPart =
    apiRefusalCategory != null ? ` (category: ${apiRefusalCategory})` : ""

  const question = `The model "${originalModel}" refused your request${categoryPart}. Would you like to retry on the fallback model "${fallbackModel}", or keep "${originalModel}" and edit your prompt?`

  return {
    questions: [
      {
        question,
        header: "Model refused",
        options: [{ label: RETRY_LABEL }, { label: EDIT_LABEL }],
        multiSelect: false,
        allowFreeText: false,
      },
    ],
  }
}

/**
 * Map a canonical QuestionAnswer → the RefusalChoice enum value for the SDK result.
 * Falls back to "cancelled" for empty or unrecognized selections. PURE.
 */
export const mapAnswerToRefusalChoice = (
  answer: QuestionAnswer,
): RefusalChoice => {
  const label = answer.selections[0]?.labels[0]
  if (label === RETRY_LABEL) return "retry_fallback"
  if (label === EDIT_LABEL) return "edit_prompt"
  return "cancelled"
}
