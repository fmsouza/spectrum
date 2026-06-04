import { z } from "zod"
import { AliasNameSchema, HarnessIdSchema, ProfileIdSchema } from "./ids"

export const ProfileSchema = z
  .object({
    id: ProfileIdSchema,
    name: z.string().min(1),
    harnessId: HarnessIdSchema,
    alias: AliasNameSchema,
    env: z.record(z.string(), z.string()),
  })
  .strict()

export type Profile = z.infer<typeof ProfileSchema>
