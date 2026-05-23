import { z } from "zod"
import { AliasNameSchema, ProviderIdSchema } from "./ids"

export const ModelAliasSchema = z.object({
  alias: AliasNameSchema,
  providerId: ProviderIdSchema,
  providerModel: z.string().min(1),
}).strict()

export type ModelAlias = z.infer<typeof ModelAliasSchema>
