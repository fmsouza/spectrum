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
    // Optional CLI args (proxied mode only), rendered with the same {{proxyUrl}}/{{proxyKey}}/{{model}}
    // tokens as envTemplate. Used by harnesses that need flags to route through the proxy (e.g. codex
    // requires `-c` provider config; env vars alone don't redirect it).
    argsTemplate: z.array(z.string()).optional(),
    description: z.string().optional(),
    builtIn: z.boolean(),
  })
  .strict()

export type HarnessDefinition = z.infer<typeof HarnessDefinitionSchema>
