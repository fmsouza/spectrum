import { describe, expect, it } from "bun:test"
import {
  permissionUpdatedFixture,
  sessionIdleFixture,
  textPartFixture,
  toolPartSequenceFixture,
} from "./fixtures/opencode-events"
import { OpencodeEventSchema, buildOpencodeProxyConfig } from "./transport"

describe("OpencodeEventSchema", () => {
  it("parses a message.part.updated (text part) envelope", () => {
    expect(OpencodeEventSchema.safeParse(textPartFixture).success).toBe(true)
  })

  it("parses the full tool-part lifecycle fixture sequence", () => {
    for (const event of toolPartSequenceFixture) {
      expect(OpencodeEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("parses permission.updated and session.idle", () => {
    expect(
      OpencodeEventSchema.safeParse(permissionUpdatedFixture).success,
    ).toBe(true)
    expect(OpencodeEventSchema.safeParse(sessionIdleFixture).success).toBe(true)
  })

  it("rejects a frame whose type string is unknown", () => {
    expect(
      OpencodeEventSchema.safeParse({ type: "totally.unknown", properties: {} })
        .success,
    ).toBe(false)
  })

  it("rejects a frame missing the discriminant type field", () => {
    expect(OpencodeEventSchema.safeParse({ properties: {} }).success).toBe(
      false,
    )
  })
})

describe("buildOpencodeProxyConfig", () => {
  it("builds a launchkit OpenAI-compatible provider + model from the proxy env", () => {
    const config = buildOpencodeProxyConfig({
      OPENAI_BASE_URL: "http://127.0.0.1:4000/v1",
      OPENAI_API_KEY: "rk_abc",
      OPENAI_MODEL: "minimax-m3",
    })
    expect(config).toEqual({
      provider: {
        launchkit: {
          npm: "@ai-sdk/openai-compatible",
          name: "LaunchKit",
          options: { baseURL: "http://127.0.0.1:4000/v1", apiKey: "rk_abc" },
          models: { "minimax-m3": {} },
        },
      },
      model: "launchkit/minimax-m3",
    })
  })

  it("returns undefined on the direct route (no OPENAI_BASE_URL / OPENAI_MODEL)", () => {
    expect(buildOpencodeProxyConfig({})).toBeUndefined()
    expect(
      buildOpencodeProxyConfig({ OPENAI_BASE_URL: "http://x" }),
    ).toBeUndefined()
  })

  it("omits apiKey when the env has none", () => {
    const config = buildOpencodeProxyConfig({
      OPENAI_BASE_URL: "http://x/v1",
      OPENAI_MODEL: "m",
    })
    expect(config?.provider.launchkit.options).toEqual({
      baseURL: "http://x/v1",
    })
  })
})
