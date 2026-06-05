import { z } from "zod"
import { HarnessIdSchema, ModelIdSchema, SessionIdSchema } from "./ids"

export const SessionSchema = z
  .object({
    id: SessionIdSchema,
    harnessId: HarnessIdSchema,
    modelId: ModelIdSchema.optional(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
    exitCode: z.number().int().optional(),
    name: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
  })
  .strict()

export type Session = z.infer<typeof SessionSchema>
