import { describe, expect, it } from "bun:test"
import type { Config } from "@launchkit/config"
import { createRouter } from "./router"

const config = {
  version: 2,
  settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  providers: [
    {
      id: "p1",
      name: "OpenAI",
      sdkProvider: "openai",
      config: {},
      secrets: {},
      models: ["gpt-4o"],
    },
  ],
  aliases: [{ alias: "fast", providerId: "p1", providerModel: "gpt-4o-mini" }],
} as unknown as Config

describe("createRouter", () => {
  it("resolves an alias to its provider and provider model", () => {
    const r = createRouter(config).resolve("fast")
    expect(r.ok && r.value.providerModel).toBe("gpt-4o-mini")
    expect(r.ok && r.value.provider.id).toBe<false | string>("p1")
  })
  it("returns unknown-alias when the alias is not in the table", () => {
    expect(createRouter(config).resolve("nope")).toEqual({
      ok: false,
      error: { kind: "unknown-alias", alias: "nope" },
    })
  })
  it("returns unknown-provider when an alias points at a missing provider", () => {
    const bad = {
      ...config,
      aliases: [{ alias: "x", providerId: "ghost", providerModel: "m" }],
    } as unknown as Config
    expect(createRouter(bad).resolve("x")).toEqual({
      ok: false,
      error: { kind: "unknown-provider", providerId: "ghost" },
    })
  })
})
