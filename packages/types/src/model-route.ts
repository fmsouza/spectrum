import { z } from "zod"
import { ModelIdSchema, ProviderIdSchema } from "./ids"

export const ModelRouteSchema = z
  .object({
    id: ModelIdSchema,
    providerId: ProviderIdSchema,
    providerModel: z.string().min(1),
    /** Optional user-set aliases/tiers (e.g. "haiku", "small") so a sub-agent that requests a
     *  different tier than the session model maps to THIS route instead of collapsing to it. */
    aliases: z.array(z.string()).default([]),
  })
  .strict()

export type ModelRoute = z.infer<typeof ModelRouteSchema>
