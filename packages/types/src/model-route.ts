import { z } from "zod"
import { ModelIdSchema, ProviderIdSchema } from "./ids"

export const ModelRouteSchema = z
  .object({
    id: ModelIdSchema,
    providerId: ProviderIdSchema,
    providerModel: z.string().min(1),
  })
  .strict()

export type ModelRoute = z.infer<typeof ModelRouteSchema>
