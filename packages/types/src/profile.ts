import { z } from "zod"
import { HarnessIdSchema, ModelIdSchema, ProfileIdSchema } from "./ids"

export const ProfileSchema = z
  .object({
    id: ProfileIdSchema,
    name: z.string().min(1),
    harnessId: HarnessIdSchema,
    modelId: ModelIdSchema.optional(),
    env: z.record(z.string(), z.string()),
  })
  .strict()

export type Profile = z.infer<typeof ProfileSchema>
