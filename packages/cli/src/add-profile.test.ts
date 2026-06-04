import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

describe("add profile", () => {
  it("appends a profile and saves the config", async () => {
    const deps = makeFakeDeps()
    const result = await runCli(deps)([
      "add",
      "profile",
      "--id",
      "prof_fast",
      "--name",
      "Fast",
      "--harness",
      "claude",
      "--model",
      "fast",
      "--env",
      "ANTHROPIC_MODEL=sonnet,FOO=bar",
    ])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const added = loaded.value.profiles.find((p) => p.id === "prof_fast")
    expect(added?.name).toBe("Fast")
    expect(added?.harnessId).toBe("claude")
    expect(added?.alias).toBe("fast")
    expect(added?.env).toEqual({ ANTHROPIC_MODEL: "sonnet", FOO: "bar" })
  })

  it("creates a profile with an empty env map when no --env flag is given", async () => {
    const deps = makeFakeDeps()
    const result = await runCli(deps)([
      "add",
      "profile",
      "--id",
      "prof_x",
      "--name",
      "X",
      "--harness",
      "claude",
      "--model",
      "default",
    ])
    expect(result).toEqual({ ok: true, value: undefined })
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles[0]?.env).toEqual({})
  })

  it("returns a usage error when a required profile flag is missing", async () => {
    const result = await runCli(makeFakeDeps())([
      "add",
      "profile",
      "--id",
      "prof_x",
      "--name",
      "X",
      "--harness",
      "claude",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a failed error when the profile id already exists", async () => {
    const seeded = {
      ...defaultConfig(),
      profiles: [
        {
          id: "prof_fast" as never,
          name: "Fast" as const,
          harnessId: "claude" as never,
          alias: "fast" as never,
          env: {},
        },
      ],
    }
    const result = await runCli(makeFakeDeps({ initialConfig: seeded }))([
      "add",
      "profile",
      "--id",
      "prof_fast",
      "--name",
      "Dup",
      "--harness",
      "codex",
      "--model",
      "default",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })
})
