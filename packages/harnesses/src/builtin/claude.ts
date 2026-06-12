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
    // Claude Code's default API retry policy (~10 attempts with growing backoff)
    // is tuned for the real Anthropic API. Against our loopback proxy it turns a
    // hard provider failure (e.g. exhausted rate-limit quota) into minutes of
    // apparent hang. Two retries still covers transient blips.
    CLAUDE_CODE_MAX_RETRIES: "2",
  },
  builtIn: true,
} satisfies HarnessDefinition
