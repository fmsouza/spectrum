import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const seededWithProfile = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "claude" as never,
      modelId: "fast" as never,
      env: {},
    },
  ],
})

describe("remove profile", () => {
  it("removes the profile by id and saves the config", async () => {
    const deps = makeFakeDeps({ initialConfig: seededWithProfile() })
    const result = await runCli(deps)(["remove", "profile", "prof_fast"])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles).toEqual([])
  })

  it("returns a failed error when the profile id is not found", async () => {
    const deps = makeFakeDeps({ initialConfig: seededWithProfile() })
    const result = await runCli(deps)(["remove", "profile", "prof_ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")

    // The existing profile is untouched.
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles).toHaveLength(1)
  })

  it("returns a usage error when no profile id is given", async () => {
    const result = await runCli(makeFakeDeps())(["remove", "profile"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
