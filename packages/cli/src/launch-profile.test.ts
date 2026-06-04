import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import type { LaunchParams } from "@launchkit/harnesses"
import {
  AliasNameSchema,
  type HarnessDefinition,
  HarnessIdSchema,
} from "@launchkit/types"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const harness = (id: string): HarnessDefinition => ({
  id: HarnessIdSchema.parse(id),
  name: id,
  command: id,
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
})

const claude = harness("claude")
const codex = harness("codex")

const seededWithProfile = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "claude" as never,
      alias: "fast" as never,
      env: { ANTHROPIC_MODEL: "sonnet" },
    },
  ],
})

describe("launch --profile", () => {
  it("seeds harness, alias and env from the profile", async () => {
    const calls: LaunchParams[] = []
    const deps = makeFakeDeps({
      harnesses: [claude, codex],
      initialConfig: seededWithProfile(),
      launchSpy: (p) => calls.push(p),
    })

    const result = await runCli(deps)(["launch", "--profile", "prof_fast"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(calls[0]?.harness.id).toBe("claude")
    expect(String(calls[0]?.model)).toBe("fast")
    expect(calls[0]?.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })

    // The recorded session uses the profile's harness + alias.
    const list = deps.sessions.query()
    expect(list.ok && list.value[0]?.harnessId).toBe("claude")
    expect(list.ok && String(list.value[0]?.alias)).toBe("fast")
  })

  it("lets a positional harnessId and --model override the profile", async () => {
    const calls: LaunchParams[] = []
    const deps = makeFakeDeps({
      harnesses: [claude, codex],
      initialConfig: seededWithProfile(),
      launchSpy: (p) => calls.push(p),
    })

    const result = await runCli(deps)([
      "launch",
      "codex",
      "--profile",
      "prof_fast",
      "--model",
      "slow",
    ])

    expect(result).toEqual({ ok: true, value: undefined })
    // positional harnessId beats the profile's harness ...
    expect(calls[0]?.harness.id).toBe("codex")
    // ... and --model beats the profile's alias ...
    expect(String(calls[0]?.model)).toBe("slow")
    // ... while the profile's env is still seeded.
    expect(calls[0]?.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })
  })

  it("returns a usage error when --profile names an unknown profile", async () => {
    const deps = makeFakeDeps({
      harnesses: [claude],
      initialConfig: seededWithProfile(),
    })
    const result = await runCli(deps)(["launch", "--profile", "prof_ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("still requires a positional harnessId when no --profile is given", async () => {
    const result = await runCli(makeFakeDeps({ harnesses: [claude] }))([
      "launch",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
