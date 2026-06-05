import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"

export const claude: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    // Use ANTHROPIC_AUTH_TOKEN (the Bearer auth for a custom gateway), not
    // ANTHROPIC_API_KEY: it takes precedence over a cached Max/Pro subscription
    // OAuth login, so Claude Code sends our proxy key. ANTHROPIC_API_KEY does
    // not (the subscription wins), which caused a 401 retry loop. We omit
    // ANTHROPIC_API_KEY to avoid the precedence ambiguity / approval prompt.
    ANTHROPIC_AUTH_TOKEN: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  builtIn: true,
} satisfies HarnessDefinition
