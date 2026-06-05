import { z } from "zod"
import { ApiFormatSchema } from "./enums"
import { HarnessIdSchema } from "./ids"

export const HarnessDefinitionSchema = z
  .object({
    id: HarnessIdSchema,
    name: z.string().min(1),
    command: z.string().min(1),
    apiFormat: ApiFormatSchema,
    envTemplate: z.record(z.string(), z.string()),
    description: z.string().optional(),
    builtIn: z.boolean(),
  })
  .strict()

export type HarnessDefinition = z.infer<typeof HarnessDefinitionSchema>
