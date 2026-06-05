import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"

export const codex: HarnessDefinition = {
  id: HarnessIdSchema.parse("codex"),
  name: "Codex",
  command: "codex",
  apiFormat: "openai",
  // codex (0.130+) only routes through a provider defined in its config.toml — env vars like
  // OPENAI_BASE_URL are ignored. So we register a provider via `-c` overrides that points codex at
  // the proxy over the OpenAI Responses API (codex dropped wire_api="chat"), and pass the per-run
  // key via OPENAI_API_KEY (codex sends it as Bearer; no ChatGPT-login override was observed).
  envTemplate: {
    OPENAI_API_KEY: "{{proxyKey}}",
  },
  argsTemplate: [
    "-c",
    "model_provider=launchkit",
    "-c",
    'model_providers.launchkit.name="LaunchKit"',
    "-c",
    'model_providers.launchkit.base_url="{{proxyUrl}}/v1"',
    "-c",
    'model_providers.launchkit.env_key="OPENAI_API_KEY"',
    "-c",
    'model_providers.launchkit.wire_api="responses"',
    "-m",
    "{{model}}",
  ],
  builtIn: true,
} satisfies HarnessDefinition
