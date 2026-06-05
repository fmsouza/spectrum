import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"

export const opencode: HarnessDefinition = {
  id: HarnessIdSchema.parse("opencode"),
  name: "opencode",
  command: "opencode",
  apiFormat: "openai",
  envTemplate: {
    OPENAI_BASE_URL: "{{proxyUrl}}",
    OPENAI_API_KEY: "{{proxyKey}}",
    OPENAI_MODEL: "{{model}}",
  },
  builtIn: true,
} satisfies HarnessDefinition
