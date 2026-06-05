import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"
import { createMemoryWriter } from "./writer"

const seededWithProfiles = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_default" as never,
      name: "Default" as const,
      harnessId: "claude" as never,
      env: {},
    },
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "codex" as never,
      modelId: "fast" as never,
      env: { OPENAI_BASE_URL: "x" },
    },
  ],
})

describe("list profiles", () => {
  it("writes one tab-delimited line per profile with id, name and [harness · modelId], defaulting a missing modelId to 'default'", async () => {
    const out = createMemoryWriter()
    const deps = makeFakeDeps({ out, initialConfig: seededWithProfiles() })

    const result = await runCli(deps)(["list", "profiles"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(out.lines).toEqual([
      "prof_default\tDefault\t[claude · default]",
      "prof_fast\tFast\t[codex · fast]",
    ])
  })

  it("writes nothing when there are no profiles", async () => {
    const out = createMemoryWriter()
    const deps = makeFakeDeps({ out, initialConfig: defaultConfig() })

    const result = await runCli(deps)(["list", "profiles"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(out.lines).toEqual([])
  })

  it("returns a usage error for an unknown list target", async () => {
    const result = await runCli(makeFakeDeps())(["list", "widgets"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
