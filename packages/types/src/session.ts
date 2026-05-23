import { z } from "zod"
import { AliasNameSchema, HarnessIdSchema, SessionIdSchema } from "./ids"

export const SessionSchema = z
  .object({
    id: SessionIdSchema,
    harnessId: HarnessIdSchema,
    alias: AliasNameSchema,
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
    exitCode: z.number().int().optional(),
  })
  .strict()

export type Session = z.infer<typeof SessionSchema>
