import { describe, expect, it } from "bun:test"
import { HarnessDefinitionSchema, HarnessIdSchema } from "@launchkit/types"
import { ALLOWED_TOKENS } from "../tokens"
import { builtinHarnesses, claude, codex, openclaw, opencode } from "./index"

const tokensIn = (s: string): readonly string[] =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? "")

describe("builtinHarnesses", () => {
  it("lists all four built-ins in a stable order when imported", () => {
    expect(builtinHarnesses.map((h) => h.id)).toEqual([
      HarnessIdSchema.parse("claude"),
      HarnessIdSchema.parse("codex"),
      HarnessIdSchema.parse("opencode"),
      HarnessIdSchema.parse("openclaw"),
    ])
  })

  it("marks every built-in as builtIn:true", () => {
    expect(builtinHarnesses.every((h) => h.builtIn === true)).toBe(true)
  })

  it("parses every built-in through HarnessDefinitionSchema", () => {
    for (const h of builtinHarnesses) {
      expect(HarnessDefinitionSchema.safeParse(h).success).toBe(true)
    }
  })

  it("uses only the allowed tokens in every env + args template value", () => {
    for (const h of builtinHarnesses) {
      const values = [
        ...Object.values(h.envTemplate),
        ...(h.argsTemplate ?? []),
      ]
      for (const value of values) {
        for (const token of tokensIn(value)) {
          expect(ALLOWED_TOKENS).toContain(
            token as (typeof ALLOWED_TOKENS)[number],
          )
        }
      }
    }
  })

  it("wires claude to the Anthropic env vars with proxy tokens", () => {
    expect(claude.apiFormat).toBe("anthropic")
    expect(claude.command).toBe("claude")
    expect(claude.envTemplate).toEqual({
      ANTHROPIC_BASE_URL: "{{proxyUrl}}",
      ANTHROPIC_AUTH_TOKEN: "{{proxyKey}}",
      ANTHROPIC_MODEL: "{{model}}",
    })
  })

  it("wires opencode to the OpenAI env vars with proxy tokens", () => {
    expect(opencode.apiFormat).toBe("openai")
    expect(opencode.envTemplate).toEqual({
      OPENAI_BASE_URL: "{{proxyUrl}}",
      OPENAI_API_KEY: "{{proxyKey}}",
      OPENAI_MODEL: "{{model}}",
    })
  })

  it("wires codex to route through the proxy via -c provider args (Responses API) + the proxy key", () => {
    expect(codex.apiFormat).toBe("openai")
    // codex ignores OPENAI_BASE_URL, so it gets a `-c` provider override instead; only the key is env.
    expect(codex.envTemplate).toEqual({ OPENAI_API_KEY: "{{proxyKey}}" })
    const args = (codex.argsTemplate ?? []).join(" ")
    expect(args).toContain("model_provider=launchkit")
    expect(args).toContain('base_url="{{proxyUrl}}/v1"')
    expect(args).toContain('wire_api="responses"')
    expect(args).toContain("{{model}}")
  })

  it("wires openclaw to the Anthropic env vars", () => {
    expect(openclaw.apiFormat).toBe("anthropic")
    expect(openclaw.envTemplate).toEqual(claude.envTemplate)
  })
})
