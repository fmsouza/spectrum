import { describe, expect, it } from "bun:test"
import type { Config } from "@launchkit/config"
import { isErr } from "@launchkit/utils"
import { createRouter } from "./router"

const config = {
  version: 2,
  settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      sdkProvider: "openai",
      config: {},
      secrets: {},
      models: ["gpt-4o"],
    },
  ],
  models: [{ id: "mdl_fast", providerId: "openai", providerModel: "gpt-4o" }],
} as unknown as Config

describe("createRouter", () => {
  it("resolves a model id to its provider and provider model", () => {
    const r = createRouter(config).resolve("mdl_fast")
    expect(r.ok && r.value.providerModel).toBe("gpt-4o")
    expect(r.ok && r.value.provider.id).toBe<false | string>("openai")
  })
  it("returns unknown-model when the id is not in the table", () => {
    const r2 = createRouter(config).resolve("nope")
    expect(isErr(r2)).toBe(true)
    if (isErr(r2))
      expect(r2.error).toEqual({ kind: "unknown-model", id: "nope" })
  })
  it("returns unknown-provider when a model points at a missing provider", () => {
    const bad = {
      ...config,
      models: [{ id: "mdl_x", providerId: "ghost", providerModel: "m" }],
    } as unknown as Config
    expect(createRouter(bad).resolve("mdl_x")).toEqual({
      ok: false,
      error: { kind: "unknown-provider", providerId: "ghost" },
    })
  })

  it("resolves against the latest config when given a getter (sees models added after construction)", () => {
    let current = { ...config, models: [] } as unknown as Config
    const router = createRouter(() => current)
    // Not present yet: a model added to config only after the proxy started.
    expect(isErr(router.resolve("mdl_fast"))).toBe(true)
    // The live config changes (e.g. the user adds a model in the GUI) — no rebuild needed.
    current = config
    const r = router.resolve("mdl_fast")
    expect(r.ok && r.value.providerModel).toBe("gpt-4o")
  })
})
